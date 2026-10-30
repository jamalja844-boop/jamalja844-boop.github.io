<?php
/**
 * Detectie van thema, SEO-plugins, trackingplugins, formulierplugins en
 * consentoplossingen, zodat de plugin niets dubbel doet.
 *
 * @package CSAAM
 */

namespace CSAAM;

defined( 'ABSPATH' ) || exit;

/**
 * Environment.
 */
class Environment {

	/**
	 * Actieve SEO-plugin: rankmath|yoast|aioseo|seopress|''.
	 *
	 * @return string
	 */
	public static function seo_plugin() {
		$found = self::seo_plugins();
		return $found ? $found[0] : '';
	}

	/**
	 * Alle actieve SEO-plugins (meer dan één = conflict).
	 *
	 * @return string[]
	 */
	public static function seo_plugins() {
		$found = array();
		if ( defined( 'RANK_MATH_VERSION' ) || class_exists( 'RankMath' ) ) {
			$found[] = 'rankmath';
		}
		if ( defined( 'AIOSEO_VERSION' ) || function_exists( 'aioseo' ) ) {
			$found[] = 'aioseo';
		}
		if ( defined( 'WPSEO_VERSION' ) ) {
			$found[] = 'yoast';
		}
		if ( defined( 'SEOPRESS_VERSION' ) ) {
			$found[] = 'seopress';
		}
		return $found;
	}

	/**
	 * Leesbare naam van een SEO-plugin.
	 *
	 * @param string $slug Slug.
	 * @return string
	 */
	public static function seo_label( $slug ) {
		$labels = array(
			'rankmath' => 'Rank Math',
			'aioseo'   => 'All in One SEO',
			'yoast'    => 'Yoast SEO',
			'seopress' => 'SEOPress',
		);
		return isset( $labels[ $slug ] ) ? $labels[ $slug ] : __( 'Geen', 'clean-seo-ads-ai' );
	}

	/**
	 * Trackingplugins die al Google-tags plaatsen.
	 *
	 * @return string[]
	 */
	public static function tracking_plugins() {
		$found = array();
		if ( defined( 'GOOGLESITEKIT_VERSION' ) ) {
			$found[] = 'Site Kit by Google';
		}
		if ( defined( 'GTM4WP_VERSION' ) || defined( 'GTM4WP_PATH' ) ) {
			$found[] = 'GTM4WP (Google Tag Manager for WordPress)';
		}
		if ( defined( 'MONSTERINSIGHTS_VERSION' ) ) {
			$found[] = 'MonsterInsights';
		}
		if ( defined( 'EXACTMETRICS_VERSION' ) ) {
			$found[] = 'ExactMetrics';
		}
		if ( class_exists( 'PixelYourSite\\PYS' ) || defined( 'PYS_FREE_VERSION' ) || defined( 'PYS_VERSION' ) ) {
			$found[] = 'PixelYourSite';
		}
		if ( function_exists( 'wc_google_analytics_integration' ) || class_exists( 'WC_Google_Gtag_JS' ) ) {
			$found[] = 'Google Analytics for WooCommerce';
		}
		return $found;
	}

	/**
	 * Consentoplossingen.
	 *
	 * @return string[]
	 */
	public static function consent_plugins() {
		$found = array();
		if ( function_exists( 'wp_has_consent' ) ) {
			$found[] = 'WP Consent API';
		}
		if ( defined( 'cmplz_version' ) || defined( 'CMPLZ_VERSION' ) ) {
			$found[] = 'Complianz';
		}
		if ( defined( 'CLI_VERSION' ) || defined( 'CKY_APP_VERSION' ) ) {
			$found[] = 'CookieYes';
		}
		if ( class_exists( 'Cookiebot_WP' ) || defined( 'CYBOT_COOKIEBOT_VERSION' ) ) {
			$found[] = 'Cookiebot';
		}
		if ( defined( 'BORLABS_COOKIE_VERSION' ) ) {
			$found[] = 'Borlabs Cookie';
		}
		return $found;
	}

	/**
	 * Formulierplugins.
	 *
	 * @return array<string,string> slug => label.
	 */
	public static function form_plugins() {
		$found = array();
		if ( defined( 'WPCF7_VERSION' ) ) {
			$found['cf7'] = 'Contact Form 7';
		}
		if ( class_exists( 'GFForms' ) ) {
			$found['gravity'] = 'Gravity Forms';
		}
		if ( defined( 'WPFORMS_VERSION' ) ) {
			$found['wpforms'] = 'WPForms';
		}
		if ( defined( 'ELEMENTOR_PRO_VERSION' ) ) {
			$found['elementor'] = 'Elementor Pro Forms';
		}
		if ( defined( 'FLUENTFORM' ) || defined( 'FLUENTFORM_VERSION' ) ) {
			$found['fluent'] = 'Fluent Forms';
		}
		if ( class_exists( 'Ninja_Forms' ) ) {
			$found['ninja'] = 'Ninja Forms';
		}
		if ( defined( 'FORMIDABLE_VERSION' ) || class_exists( 'FrmAppHelper' ) ) {
			$found['formidable'] = 'Formidable Forms';
		}
		return $found;
	}

	/**
	 * Cacheplugins (voor advies over snelheid).
	 *
	 * @return string[]
	 */
	public static function cache_plugins() {
		$found = array();
		$map   = array(
			'WP_ROCKET_VERSION'             => 'WP Rocket',
			'LSCWP_V'                       => 'LiteSpeed Cache',
			'W3TC'                          => 'W3 Total Cache',
			'WPFC_WP_CONTENT_BASENAME'      => 'WP Fastest Cache',
			'AUTOPTIMIZE_PLUGIN_VERSION'    => 'Autoptimize',
			'SiteGround_Optimizer\\VERSION' => 'SiteGround Optimizer',
		);
		foreach ( $map as $constant => $label ) {
			if ( defined( $constant ) ) {
				$found[] = $label;
			}
		}
		if ( function_exists( 'wp_cache_phase2' ) ) {
			$found[] = 'WP Super Cache';
		}
		return $found;
	}

	/**
	 * Paginabouwers (relevant bij het toepassen van tekstvoorstellen).
	 *
	 * @param int $post_id Bericht-ID.
	 * @return string '' als de inhoud gewoon in post_content staat.
	 */
	public static function page_builder( $post_id ) {
		if ( 'builder' === get_post_meta( $post_id, '_elementor_edit_mode', true ) ) {
			return 'Elementor';
		}
		if ( 'on' === get_post_meta( $post_id, '_et_pb_use_builder', true ) ) {
			return 'Divi';
		}
		if ( get_post_meta( $post_id, '_bricks_page_content_2', true ) ) {
			return 'Bricks';
		}
		$content = (string) get_post_field( 'post_content', $post_id );
		if ( false !== strpos( $content, '[vc_row' ) ) {
			return 'WPBakery';
		}
		if ( false !== strpos( $content, '[fusion_' ) ) {
			return 'Avada';
		}
		return '';
	}

	/**
	 * Overzicht voor het dashboard en de technische controle.
	 *
	 * @return array
	 */
	public static function summary() {
		$theme = wp_get_theme();
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$active  = (array) get_option( 'active_plugins', array() );
		$plugins = array();
		foreach ( get_plugins() as $file => $data ) {
			if ( in_array( $file, $active, true ) ) {
				$plugins[] = $data['Name'] . ' ' . $data['Version'];
			}
		}
		return array(
			'wp_version'       => get_bloginfo( 'version' ),
			'php_version'      => PHP_VERSION,
			'theme'            => $theme->get( 'Name' ) . ' ' . $theme->get( 'Version' ),
			'parent_theme'     => $theme->parent() ? $theme->parent()->get( 'Name' ) : '',
			'seo_plugins'      => array_map( array( __CLASS__, 'seo_label' ), self::seo_plugins() ),
			'tracking_plugins' => self::tracking_plugins(),
			'consent_plugins'  => self::consent_plugins(),
			'form_plugins'     => array_values( self::form_plugins() ),
			'cache_plugins'    => self::cache_plugins(),
			'active_plugins'   => $plugins,
			'multisite'        => is_multisite(),
			'https'            => 0 === strpos( home_url(), 'https://' ),
			'indexable'        => (bool) get_option( 'blog_public' ),
		);
	}
}
