<?php
/**
 * Eenvoudige rate-limiter en afkoelperiodes per API.
 *
 * @package CSAAM
 */

namespace CSAAM;

defined( 'ABSPATH' ) || exit;

/**
 * Rate_Limiter.
 */
class Rate_Limiter {

	/**
	 * Registreert een aanroep; false als de limiet bereikt is.
	 *
	 * @param string $bucket Naam.
	 * @param int    $limit  Max. aantal aanroepen per venster.
	 * @param int    $window Venster in seconden.
	 * @return bool
	 */
	public static function hit( $bucket, $limit, $window ) {
		$slot  = (int) floor( time() / $window );
		$key   = 'csaam_rl_' . md5( $bucket . '|' . $slot );
		$count = (int) get_transient( $key );
		if ( $count >= $limit ) {
			return false;
		}
		set_transient( $key, $count + 1, $window );
		return true;
	}

	/**
	 * Huidig aantal aanroepen in het venster.
	 *
	 * @param string $bucket Naam.
	 * @param int    $window Venster in seconden.
	 * @return int
	 */
	public static function count( $bucket, $window ) {
		$slot = (int) floor( time() / $window );
		return (int) get_transient( 'csaam_rl_' . md5( $bucket . '|' . $slot ) );
	}

	/**
	 * Zet een afkoelperiode (bijv. na HTTP 429).
	 *
	 * @param string $bucket  Naam.
	 * @param int    $seconds Duur.
	 */
	public static function cool_down( $bucket, $seconds ) {
		set_transient( 'csaam_cd_' . md5( $bucket ), time() + $seconds, $seconds );
	}

	/**
	 * Resterende afkoeltijd in seconden (0 = geen).
	 *
	 * @param string $bucket Naam.
	 * @return int
	 */
	public static function cooling( $bucket ) {
		$until = (int) get_transient( 'csaam_cd_' . md5( $bucket ) );
		return max( 0, $until - time() );
	}
}
