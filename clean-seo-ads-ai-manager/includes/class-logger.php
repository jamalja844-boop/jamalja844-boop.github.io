<?php
/**
 * Veilige logging: geen sleutels, tokens, e-mailadressen, telefoonnummers of
 * prompt-inhoud. Context wordt automatisch geredigeerd.
 *
 * @package CSAAM
 */

namespace CSAAM;

defined( 'ABSPATH' ) || exit;

/**
 * Logger.
 */
class Logger {

	const SENSITIVE_KEYS = array( 'key', 'token', 'secret', 'password', 'authorization', 'code', 'refresh', 'access', 'prompt', 'content', 'email', 'phone' );

	/**
	 * Informatie.
	 *
	 * @param string $channel Kanaal.
	 * @param string $message Bericht.
	 * @param array  $context Context.
	 */
	public static function info( $channel, $message, array $context = array() ) {
		self::write( 'info', $channel, $message, $context );
	}

	/**
	 * Waarschuwing.
	 *
	 * @param string $channel Kanaal.
	 * @param string $message Bericht.
	 * @param array  $context Context.
	 */
	public static function warning( $channel, $message, array $context = array() ) {
		self::write( 'warning', $channel, $message, $context );
	}

	/**
	 * Fout.
	 *
	 * @param string $channel Kanaal.
	 * @param string $message Bericht.
	 * @param array  $context Context.
	 */
	public static function error( $channel, $message, array $context = array() ) {
		self::write( 'error', $channel, $message, $context );
	}

	/**
	 * Redigeert gevoelige gegevens uit tekst.
	 *
	 * @param string $text Tekst.
	 * @return string
	 */
	public static function redact( $text ) {
		$text = (string) $text;
		$text = preg_replace( '/sk-ant-[A-Za-z0-9_\-]+/', '[api-sleutel]', $text );
		$text = preg_replace( '/ya29\.[A-Za-z0-9_\-\.]+/', '[access-token]', $text );
		$text = preg_replace( '/1\/\/[A-Za-z0-9_\-]{20,}/', '[refresh-token]', $text );
		$text = preg_replace( '/AIza[0-9A-Za-z_\-]{30,}/', '[api-sleutel]', $text );
		$text = preg_replace( '/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', '[e-mail]', $text );
		$text = preg_replace( '/(\+31|0031|0)[\s\-]?[1-9](?:[\s\-]?\d){8}/', '[telefoon]', $text );
		return $text;
	}

	/**
	 * Schrijft een regel naar de logtabel.
	 *
	 * @param string $level   Niveau.
	 * @param string $channel Kanaal.
	 * @param string $message Bericht.
	 * @param array  $context Context.
	 */
	private static function write( $level, $channel, $message, array $context ) {
		global $wpdb;
		foreach ( $context as $k => $v ) {
			foreach ( self::SENSITIVE_KEYS as $needle ) {
				if ( false !== stripos( (string) $k, $needle ) && ! in_array( $k, array( 'status_code', 'error_code' ), true ) ) {
					$context[ $k ] = '[verwijderd]';
					continue 2;
				}
			}
			if ( is_scalar( $v ) ) {
				$context[ $k ] = self::redact( (string) $v );
			} else {
				$context[ $k ] = self::redact( (string) wp_json_encode( $v ) );
			}
		}
		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Installer::table( 'log' ),
			array(
				'level'      => substr( $level, 0, 10 ),
				'channel'    => substr( sanitize_key( $channel ), 0, 40 ),
				'message'    => self::redact( mb_substr( (string) $message, 0, 1000 ) ),
				'context'    => (string) wp_json_encode( $context ),
				'created_at' => current_time( 'mysql', true ),
			)
		);
	}

	/**
	 * Laatste logregels.
	 *
	 * @param int $limit Aantal.
	 * @return array
	 */
	public static function recent( $limit = 100 ) {
		global $wpdb;
		$table = Installer::table( 'log' );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return $wpdb->get_results( $wpdb->prepare( "SELECT level, channel, message, context, created_at FROM {$table} ORDER BY id DESC LIMIT %d", $limit ), ARRAY_A );
	}

	/**
	 * Verwijdert oude logregels en events (dagelijkse cron).
	 */
	public static function prune() {
		global $wpdb;
		$log    = Installer::table( 'log' );
		$events = Installer::table( 'events' );
		$days   = (int) Settings::get( 'log_retention_days' );
		$edays  = (int) Settings::get( 'event_retention_days' );
		// phpcs:disable WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$log} WHERE created_at < %s", gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS ) ) );
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$events} WHERE created_at < %s", gmdate( 'Y-m-d H:i:s', time() - $edays * DAY_IN_SECONDS ) ) );
		// phpcs:enable
	}
}
