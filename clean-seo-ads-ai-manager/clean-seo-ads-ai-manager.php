<?php
/**
 * Plugin Name:       Clean SEO & Ads AI Manager
 * Plugin URI:        https://cleanschoonmaakbedrijf.nl
 * Description:       SEO-audit, lokale SEO, Google Ads (alleen-lezen), Search Console, GA4, PageSpeed, conversiemeting en AI-optimalisatie met goedkeuringsflow — vanuit één Nederlandstalig dashboard.
 * Version:           1.0.0
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            Clean Schoonmaakbedrijf B.V.
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       clean-seo-ads-ai
 * Domain Path:       /languages
 *
 * @package CSAAM
 */

defined( 'ABSPATH' ) || exit;

define( 'CSAAM_VERSION', '1.0.0' );
define( 'CSAAM_DB_VERSION', '1' );
define( 'CSAAM_FILE', __FILE__ );
define( 'CSAAM_DIR', plugin_dir_path( __FILE__ ) );
define( 'CSAAM_URL', plugin_dir_url( __FILE__ ) );
define( 'CSAAM_CAP', 'csaam_manage' );

if ( version_compare( PHP_VERSION, '7.4', '<' ) ) {
	add_action(
		'admin_notices',
		static function () {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'Clean SEO & Ads AI Manager vereist PHP 7.4 of hoger.', 'clean-seo-ads-ai' ) . '</p></div>';
		}
	);
	return;
}

/**
 * PSR-4-achtige autoloader die WordPress-bestandsnamen volgt.
 * CSAAM\Integrations\Google_Ads => includes/integrations/class-google-ads.php
 */
spl_autoload_register(
	static function ( $class ) {
		if ( 0 !== strpos( $class, 'CSAAM\\' ) ) {
			return;
		}
		$parts = explode( '\\', substr( $class, 6 ) );
		$name  = array_pop( $parts );
		$dir   = strtolower( implode( '/', $parts ) );
		$file  = strtolower( str_replace( '_', '-', $name ) );
		$base  = CSAAM_DIR . 'includes/' . ( $dir ? $dir . '/' : '' );
		foreach ( array( 'class-', 'interface-', 'trait-' ) as $prefix ) {
			if ( is_readable( $base . $prefix . $file . '.php' ) ) {
				require_once $base . $prefix . $file . '.php';
				return;
			}
		}
	}
);

register_activation_hook( __FILE__, array( 'CSAAM\\Installer', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'CSAAM\\Installer', 'deactivate' ) );

add_action( 'plugins_loaded', array( 'CSAAM\\Plugin', 'instance' ) );
