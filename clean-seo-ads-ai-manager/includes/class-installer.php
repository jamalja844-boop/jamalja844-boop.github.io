<?php
/**
 * Activatie, databasetabellen, rechten en geplande taken.
 *
 * @package CSAAM
 */

namespace CSAAM;

defined( 'ABSPATH' ) || exit;

/**
 * Installer.
 */
class Installer {

	const CRON_AUDIT  = 'csaam_weekly_audit';
	const CRON_REPORT = 'csaam_monthly_report';
	const CRON_PRUNE  = 'csaam_daily_prune';

	/**
	 * Plugin-activatie.
	 */
	public static function activate() {
		self::create_tables();
		self::add_caps();
		Settings::ensure_defaults();

		if ( ! wp_next_scheduled( self::CRON_AUDIT ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'weekly', self::CRON_AUDIT );
		}
		if ( ! wp_next_scheduled( self::CRON_PRUNE ) ) {
			wp_schedule_event( time() + 2 * HOUR_IN_SECONDS, 'daily', self::CRON_PRUNE );
		}
		update_option( 'csaam_db_version', CSAAM_DB_VERSION, false );
	}

	/**
	 * Plugin-deactivatie: alleen geplande taken stoppen, geen data verwijderen.
	 */
	public static function deactivate() {
		wp_clear_scheduled_hook( self::CRON_AUDIT );
		wp_clear_scheduled_hook( self::CRON_REPORT );
		wp_clear_scheduled_hook( self::CRON_PRUNE );
	}

	/**
	 * Databaseschema bijwerken indien nodig.
	 */
	public static function maybe_upgrade() {
		if ( get_option( 'csaam_db_version' ) !== CSAAM_DB_VERSION ) {
			self::activate();
		}
	}

	/**
	 * Geeft de beheerdersrol de plugin-capability.
	 */
	public static function add_caps() {
		$role = get_role( 'administrator' );
		if ( $role && ! $role->has_cap( CSAAM_CAP ) ) {
			$role->add_cap( CSAAM_CAP );
		}
	}

	/**
	 * Tabelnamen.
	 *
	 * @param string $name Korte naam.
	 * @return string
	 */
	public static function table( $name ) {
		global $wpdb;
		return $wpdb->prefix . 'csaam_' . $name;
	}

	/**
	 * Maakt of wijzigt tabellen met dbDelta.
	 */
	public static function create_tables() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset = $wpdb->get_charset_collate();
		$audit   = self::table( 'audit' );
		$props   = self::table( 'proposals' );
		$events  = self::table( 'events' );
		$log     = self::table( 'log' );

		dbDelta(
			"CREATE TABLE {$audit} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			post_id bigint(20) unsigned NOT NULL,
			url varchar(2048) NOT NULL DEFAULT '',
			score tinyint(3) unsigned NOT NULL DEFAULT 0,
			errors smallint(5) unsigned NOT NULL DEFAULT 0,
			warnings smallint(5) unsigned NOT NULL DEFAULT 0,
			data longtext NOT NULL,
			fingerprint varchar(32) NOT NULL DEFAULT '',
			scanned_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY post_id (post_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$props} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			post_id bigint(20) unsigned NOT NULL DEFAULT 0,
			task varchar(50) NOT NULL,
			field varchar(50) NOT NULL DEFAULT '',
			original longtext NOT NULL,
			proposal longtext NOT NULL,
			explanation longtext NOT NULL,
			status varchar(20) NOT NULL DEFAULT 'pending',
			model varchar(80) NOT NULL DEFAULT '',
			input_tokens int(10) unsigned NOT NULL DEFAULT 0,
			output_tokens int(10) unsigned NOT NULL DEFAULT 0,
			cost decimal(10,4) NOT NULL DEFAULT 0,
			created_by bigint(20) unsigned NOT NULL DEFAULT 0,
			created_at datetime NOT NULL,
			decided_by bigint(20) unsigned NOT NULL DEFAULT 0,
			decided_at datetime DEFAULT NULL,
			PRIMARY KEY  (id),
			KEY post_id (post_id),
			KEY status (status)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$events} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			event_type varchar(40) NOT NULL,
			label varchar(190) NOT NULL DEFAULT '',
			page_path varchar(255) NOT NULL DEFAULT '',
			source varchar(20) NOT NULL DEFAULT 'server',
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY event_type (event_type),
			KEY created_at (created_at)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$log} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			level varchar(10) NOT NULL,
			channel varchar(40) NOT NULL,
			message text NOT NULL,
			context text NOT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY channel (channel),
			KEY created_at (created_at)
			) {$charset};"
		);
	}
}
