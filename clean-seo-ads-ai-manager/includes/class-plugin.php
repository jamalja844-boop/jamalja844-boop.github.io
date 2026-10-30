<?php
/**
 * Hoofdklasse: koppelt alle onderdelen aan WordPress.
 *
 * @package CSAAM
 */

namespace CSAAM;

use CSAAM\Integrations\Google_OAuth;
use CSAAM\Modules\Conversions;
use CSAAM\Modules\Reports;
use CSAAM\Modules\Seo_Audit;

defined( 'ABSPATH' ) || exit;

/**
 * Plugin.
 */
final class Plugin {

	/**
	 * Instantie.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * Singleton.
	 *
	 * @return Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		load_plugin_textdomain( 'clean-seo-ads-ai', false, dirname( plugin_basename( CSAAM_FILE ) ) . '/languages' );

		Installer::maybe_upgrade();
		Seo_Meta::register();
		Conversions::register();
		Google_OAuth::register();
		Rest::register();

		if ( is_admin() ) {
			Admin::register();
		}

		add_action( Installer::CRON_AUDIT, array( Seo_Audit::class, 'scan_all' ) );
		add_action( Installer::CRON_PRUNE, array( Logger::class, 'prune' ) );
		add_action( Installer::CRON_REPORT, array( Reports::class, 'send_monthly' ) );
		add_action( 'init', array( $this, 'schedule_report' ) );
	}

	/**
	 * Plant of stopt de maandelijkse rapportmail volgens de instelling.
	 */
	public function schedule_report() {
		$next = wp_next_scheduled( Installer::CRON_REPORT );
		if ( Settings::get( 'report_monthly' ) && ! $next ) {
			$first = strtotime( 'first day of next month 08:00', current_time( 'timestamp' ) ) - (int) ( get_option( 'gmt_offset' ) * HOUR_IN_SECONDS ); // phpcs:ignore WordPress.DateTime.CurrentTimeTimestamp.Requested
			wp_schedule_single_event( $first, Installer::CRON_REPORT );
		} elseif ( ! Settings::get( 'report_monthly' ) && $next ) {
			wp_clear_scheduled_hook( Installer::CRON_REPORT );
		}
	}
}
