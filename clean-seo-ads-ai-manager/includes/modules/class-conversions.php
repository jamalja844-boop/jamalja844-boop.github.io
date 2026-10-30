<?php
/**
 * Conversie- en leadmeting zonder persoonsgegevens.
 *
 * - Formulierinzendingen worden server-side geteld via hooks van de
 *   formulierplugins (alleen formuliernaam, paginapad en tijdstip).
 * - Klikken op telefoon-, e-mail- en WhatsApp-links en ingestelde
 *   offerteknoppen worden met een cookieloze beacon geteld.
 * - Doorsturen naar GA4/Google Ads gebeurt alleen via een bestaande
 *   gtag/GTM-installatie; Consent Mode van Google blijft leidend.
 *
 * @package CSAAM
 */

namespace CSAAM\Modules;

use CSAAM\Demo_Data;
use CSAAM\Environment;
use CSAAM\Installer;
use CSAAM\Rate_Limiter;
use CSAAM\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Conversions.
 */
class Conversions {

	const TYPES = array( 'quote_form', 'contact', 'phone', 'email', 'whatsapp', 'cta' );

	/**
	 * Leesbare namen.
	 *
	 * @return array<string,string>
	 */
	public static function labels() {
		return array(
			'quote_form' => __( 'Offerteaanvragen', 'clean-seo-ads-ai' ),
			'contact'    => __( 'Contactformulieren', 'clean-seo-ads-ai' ),
			'phone'      => __( 'Telefoonklikken', 'clean-seo-ads-ai' ),
			'email'      => __( 'E-mailklikken', 'clean-seo-ads-ai' ),
			'whatsapp'   => __( 'WhatsApp-klikken', 'clean-seo-ads-ai' ),
			'cta'        => __( 'Offerteknop-klikken', 'clean-seo-ads-ai' ),
		);
	}

	/**
	 * Hooks registreren.
	 */
	public static function register() {
		if ( ! Settings::get( 'tracking_enabled' ) ) {
			return;
		}
		if ( Settings::get( 'tracking_forms' ) ) {
			add_action( 'wpcf7_mail_sent', array( __CLASS__, 'on_cf7' ) );
			add_action( 'gform_after_submission', array( __CLASS__, 'on_gravity' ), 10, 2 );
			add_action( 'wpforms_process_complete', array( __CLASS__, 'on_wpforms' ), 10, 4 );
			add_action( 'elementor_pro/forms/new_record', array( __CLASS__, 'on_elementor' ), 10, 1 );
			add_action( 'fluentform/submission_inserted', array( __CLASS__, 'on_fluent' ), 10, 3 );
			add_action( 'ninja_forms_after_submission', array( __CLASS__, 'on_ninja' ) );
			add_action( 'frm_after_create_entry', array( __CLASS__, 'on_formidable' ), 30, 2 );
		}
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	/**
	 * Frontend-script (klein, zonder cookies).
	 */
	public static function enqueue() {
		if ( is_admin() || ( is_user_logged_in() && current_user_can( 'edit_posts' ) ) ) {
			return; // Medewerkers niet meetellen.
		}
		$mode = Settings::get( 'tracking_datalayer' );
		wp_enqueue_script( 'csaam-tracking', CSAAM_URL . 'assets/js/tracking.js', array(), CSAAM_VERSION, true );
		if ( function_exists( 'wp_script_add_data' ) ) {
			wp_script_add_data( 'csaam-tracking', 'strategy', 'defer' );
		}
		wp_add_inline_script(
			'csaam-tracking',
			'window.csaamTracking = ' . wp_json_encode(
				array(
					'endpoint'  => esc_url_raw( rest_url( 'csaam/v1/event' ) ),
					'phone'     => (bool) Settings::get( 'tracking_phone' ),
					'email'     => (bool) Settings::get( 'tracking_email' ),
					'whatsapp'  => (bool) Settings::get( 'tracking_whatsapp' ),
					'forms'     => (bool) Settings::get( 'tracking_forms' ),
					'selectors' => array_values( (array) Settings::get( 'tracking_selectors' ) ),
					'quote'     => array_values( (array) Settings::get( 'tracking_quote_forms' ) ),
					'formTypes' => (object) self::form_types(),
					'forward'   => 'off' === $mode ? false : ( 'on' === $mode ? true : 'auto' ),
					'consent'   => (bool) Settings::get( 'tracking_consent' ),
				)
			) . ';',
			'before'
		);
	}

	/**
	 * Formulier-ID's → type, zodat de browser offerte- en contactformulieren
	 * kan onderscheiden zonder formulierinhoud te lezen.
	 *
	 * @return array<string,string>
	 */
	private static function form_types() {
		$cached = get_transient( 'csaam_form_types' );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$map  = array();
		$cpts = array(
			'cf7'     => 'wpcf7_contact_form',
			'wpforms' => 'wpforms',
		);
		foreach ( $cpts as $prefix => $cpt ) {
			if ( ! post_type_exists( $cpt ) ) {
				continue;
			}
			foreach ( get_posts(
				array(
					'post_type'   => $cpt,
					'numberposts' => 100,
					'post_status' => 'any',
				)
			) as $form ) {
				$map[ $prefix . '-' . $form->ID ] = self::classify( $form->post_title );
			}
		}
		if ( class_exists( 'GFAPI' ) ) {
			foreach ( (array) call_user_func( array( 'GFAPI', 'get_forms' ) ) as $form ) {
				$map[ 'gravity-' . $form['id'] ] = self::classify( $form['title'] );
			}
		}
		set_transient( 'csaam_form_types', $map, HOUR_IN_SECONDS );
		return $map;
	}

	/**
	 * Formuliernaam → type.
	 *
	 * @param string $name Formuliernaam.
	 * @return string
	 */
	public static function classify( $name ) {
		foreach ( (array) Settings::get( 'tracking_quote_forms' ) as $needle ) {
			if ( '' !== $needle && false !== mb_stripos( (string) $name, $needle ) ) {
				return 'quote_form';
			}
		}
		return 'contact';
	}

	/**
	 * Paginapad van de inzending (zonder querystring met mogelijke persoonsgegevens).
	 *
	 * @return string
	 */
	private static function current_path() {
		$ref = wp_get_referer();
		if ( ! $ref && isset( $_SERVER['REQUEST_URI'] ) ) {
			$ref = esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) );
		}
		$path = (string) wp_parse_url( (string) $ref, PHP_URL_PATH );
		return substr( '' !== $path ? $path : '/', 0, 255 );
	}

	/**
	 * Slaat een event op.
	 *
	 * @param string $type   Type.
	 * @param string $label  Label (formuliernaam/linktype).
	 * @param string $path   Paginapad.
	 * @param string $source server|browser.
	 * @return bool
	 */
	public static function record( $type, $label, $path, $source = 'server' ) {
		global $wpdb;
		if ( ! in_array( $type, self::TYPES, true ) ) {
			return false;
		}
		return (bool) $wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			Installer::table( 'events' ),
			array(
				'event_type' => $type,
				'label'      => mb_substr( sanitize_text_field( $label ), 0, 190 ),
				'page_path'  => mb_substr( sanitize_text_field( $path ), 0, 255 ),
				'source'     => 'browser' === $source ? 'browser' : 'server',
				'created_at' => current_time( 'mysql', true ),
			)
		);
	}

	/**
	 * Formulierinzending verwerken.
	 *
	 * @param string $name Formuliernaam.
	 */
	private static function form( $name ) {
		self::record( self::classify( $name ), $name, self::current_path() );
	}

	/**
	 * Contact Form 7.
	 *
	 * @param object $form Formulier.
	 */
	public static function on_cf7( $form ) {
		self::form( is_object( $form ) && method_exists( $form, 'title' ) ? $form->title() : 'Contact Form 7' );
	}

	/**
	 * Gravity Forms.
	 *
	 * @param array $entry Inzending.
	 * @param array $form  Formulier.
	 */
	public static function on_gravity( $entry, $form ) {
		self::form( isset( $form['title'] ) ? $form['title'] : 'Gravity Forms' );
	}

	/**
	 * WPForms.
	 *
	 * @param array $fields    Velden.
	 * @param array $entry     Inzending.
	 * @param array $form_data Formulier.
	 * @param int   $entry_id  ID.
	 */
	public static function on_wpforms( $fields, $entry, $form_data, $entry_id ) {
		self::form( isset( $form_data['settings']['form_title'] ) ? $form_data['settings']['form_title'] : 'WPForms' );
	}

	/**
	 * Elementor Pro.
	 *
	 * @param object $record Record.
	 */
	public static function on_elementor( $record ) {
		$name = is_object( $record ) && method_exists( $record, 'get_form_settings' ) ? $record->get_form_settings( 'form_name' ) : '';
		self::form( $name ? $name : 'Elementor' );
	}

	/**
	 * Fluent Forms.
	 *
	 * @param int    $entry_id  ID.
	 * @param array  $form_data Gegevens.
	 * @param object $form      Formulier.
	 */
	public static function on_fluent( $entry_id, $form_data, $form ) {
		self::form( is_object( $form ) && isset( $form->title ) ? $form->title : 'Fluent Forms' );
	}

	/**
	 * Ninja Forms.
	 *
	 * @param array $data Gegevens.
	 */
	public static function on_ninja( $data ) {
		self::form( isset( $data['settings']['title'] ) ? $data['settings']['title'] : 'Ninja Forms' );
	}

	/**
	 * Formidable Forms.
	 *
	 * @param int $entry_id ID.
	 * @param int $form_id  Formulier-ID.
	 */
	public static function on_formidable( $entry_id, $form_id ) {
		$name = 'Formidable';
		if ( class_exists( 'FrmForm' ) ) {
			$form = call_user_func( array( 'FrmForm', 'getOne' ), $form_id );
			$name = $form && isset( $form->name ) ? $form->name : $name;
		}
		self::form( $name );
	}

	/**
	 * Publiek REST-endpoint voor klikken (beacon).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public static function rest_event( $request ) {
		$ok = new \WP_REST_Response( null, 204 );
		if ( ! Settings::get( 'tracking_enabled' ) ) {
			return $ok;
		}
		// Alleen verzoeken vanaf de eigen site.
		$origin = $request->get_header( 'origin' ) ? $request->get_header( 'origin' ) : $request->get_header( 'referer' );
		if ( strtolower( (string) wp_parse_url( (string) $origin, PHP_URL_HOST ) ) !== strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) ) ) {
			return $ok;
		}
		$type = sanitize_key( (string) $request->get_param( 'type' ) );
		if ( ! in_array( $type, array( 'phone', 'email', 'whatsapp', 'cta' ), true ) ) {
			return $ok;
		}
		// Rate limit op gehasht IP (het IP wordt niet opgeslagen).
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		if ( ! Rate_Limiter::hit( 'event_' . wp_hash( $ip ), 20, 10 * MINUTE_IN_SECONDS ) || ! Rate_Limiter::hit( 'event_global', 600, MINUTE_IN_SECONDS ) ) {
			return $ok;
		}
		$path = (string) wp_parse_url( (string) $request->get_param( 'path' ), PHP_URL_PATH );
		self::record( $type, (string) $request->get_param( 'label' ), '' !== $path ? $path : '/', 'browser' );
		return $ok;
	}

	/**
	 * Totalen per type.
	 *
	 * @param int $days Dagen.
	 * @return array<string,int>
	 */
	public static function totals( $days ) {
		if ( Settings::demo() ) {
			return Demo_Data::leads( $days )['totals'];
		}
		global $wpdb;
		$table = Installer::table( 'events' );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT event_type, COUNT(*) AS total FROM {$table} WHERE created_at >= %s GROUP BY event_type", self::since( $days ) ), ARRAY_A );
		$out  = array_fill_keys( self::TYPES, 0 );
		foreach ( $rows as $r ) {
			$out[ $r['event_type'] ] = (int) $r['total'];
		}
		return $out;
	}

	/**
	 * Startmoment.
	 *
	 * @param int $days Dagen.
	 * @return string
	 */
	private static function since( $days ) {
		return gmdate( 'Y-m-d 00:00:00', time() - ( $days - 1 ) * DAY_IN_SECONDS );
	}

	/**
	 * Volledig overzicht.
	 *
	 * @param int $days Dagen.
	 * @return array
	 */
	public static function overview( $days = 30 ) {
		if ( Settings::demo() ) {
			$demo           = Demo_Data::leads( $days );
			$demo['labels'] = self::labels();
			$demo['forms']  = array();
			$demo['env']    = self::env();
			return $demo;
		}
		global $wpdb;
		$table = Installer::table( 'events' );
		$since = self::since( $days );
		// phpcs:disable WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$daily_rows = $wpdb->get_results( $wpdb->prepare( "SELECT DATE(created_at) AS d, event_type, COUNT(*) AS total FROM {$table} WHERE created_at >= %s GROUP BY d, event_type", $since ), ARRAY_A );
		$pages      = $wpdb->get_results( $wpdb->prepare( "SELECT page_path, COUNT(*) AS total FROM {$table} WHERE created_at >= %s GROUP BY page_path ORDER BY total DESC LIMIT 20", $since ), ARRAY_A );
		$forms      = $wpdb->get_results( $wpdb->prepare( "SELECT label, event_type, COUNT(*) AS total FROM {$table} WHERE created_at >= %s AND event_type IN ('quote_form','contact') GROUP BY label, event_type ORDER BY total DESC LIMIT 20", $since ), ARRAY_A );
		// phpcs:enable

		$daily = array();
		for ( $i = $days - 1; $i >= 0; $i-- ) {
			$date           = gmdate( 'Y-m-d', time() - $i * DAY_IN_SECONDS );
			$daily[ $date ] = array_merge( array( 'date' => $date ), array_fill_keys( self::TYPES, 0 ) );
		}
		foreach ( $daily_rows as $r ) {
			if ( isset( $daily[ $r['d'] ] ) ) {
				$daily[ $r['d'] ][ $r['event_type'] ] = (int) $r['total'];
			}
		}
		return array(
			'demo'   => false,
			'totals' => self::totals( $days ),
			'daily'  => array_values( $daily ),
			'pages'  => $pages,
			'forms'  => $forms,
			'labels' => self::labels(),
			'env'    => self::env(),
		);
	}

	/**
	 * Context over tracking en consent.
	 *
	 * @return array
	 */
	private static function env() {
		return array(
			'forms'    => array_values( Environment::form_plugins() ),
			'tracking' => Environment::tracking_plugins(),
			'consent'  => Environment::consent_plugins(),
		);
	}
}
