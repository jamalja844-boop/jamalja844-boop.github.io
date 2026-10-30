<?php
/**
 * Transient-cache met groepsversies (snel ongeldig te maken).
 *
 * @package CSAAM
 */

namespace CSAAM;

defined( 'ABSPATH' ) || exit;

/**
 * Cache.
 */
class Cache {

	/**
	 * Versie van een groep.
	 *
	 * @param string $group Groep.
	 * @return int
	 */
	private static function version( $group ) {
		$versions = get_option( 'csaam_cache_versions', array() );
		$global   = isset( $versions['all'] ) ? (int) $versions['all'] : 1;
		$local    = isset( $versions[ $group ] ) ? (int) $versions[ $group ] : 1;
		return $global * 100000 + $local;
	}

	/**
	 * Transient-sleutel.
	 *
	 * @param string $group Groep.
	 * @param string $key   Sleutel.
	 * @return string
	 */
	private static function key( $group, $key ) {
		return 'csaam_' . substr( md5( $group . '|' . self::version( $group ) . '|' . $key ), 0, 24 );
	}

	/**
	 * Lezen.
	 *
	 * @param string $group Groep.
	 * @param string $key   Sleutel.
	 * @return mixed|null
	 */
	public static function get( $group, $key ) {
		$value = get_transient( self::key( $group, $key ) );
		return false === $value ? null : $value;
	}

	/**
	 * Schrijven.
	 *
	 * @param string   $group Groep.
	 * @param string   $key   Sleutel.
	 * @param mixed    $value Waarde.
	 * @param int|null $ttl   Seconden; standaard uit instellingen.
	 */
	public static function set( $group, $key, $value, $ttl = null ) {
		if ( null === $ttl ) {
			$ttl = (int) Settings::get( 'cache_hours' ) * HOUR_IN_SECONDS;
		}
		set_transient( self::key( $group, $key ), $value, $ttl );
	}

	/**
	 * Haal uit cache of bereken en sla op. Fouten worden niet gecachet.
	 *
	 * @param string   $group    Groep.
	 * @param string   $key      Sleutel.
	 * @param callable $callback Levert waarde of WP_Error.
	 * @param bool     $refresh  Cache negeren.
	 * @return mixed
	 */
	public static function remember( $group, $key, callable $callback, $refresh = false ) {
		if ( ! $refresh ) {
			$hit = self::get( $group, $key );
			if ( null !== $hit ) {
				return $hit;
			}
		}
		$value = $callback();
		if ( ! is_wp_error( $value ) ) {
			self::set( $group, $key, $value );
		}
		return $value;
	}

	/**
	 * Maakt een groep (of 'all') ongeldig.
	 *
	 * @param string $group Groep.
	 */
	public static function flush_group( $group ) {
		$versions           = get_option( 'csaam_cache_versions', array() );
		$versions           = is_array( $versions ) ? $versions : array();
		$versions[ $group ] = ( isset( $versions[ $group ] ) ? (int) $versions[ $group ] : 1 ) + 1;
		update_option( 'csaam_cache_versions', $versions, true );
	}
}
