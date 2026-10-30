<?php
/**
 * Instellingen: schema, standaardwaarden, sanitization en geheimen.
 *
 * @package CSAAM
 */

namespace CSAAM;

defined( 'ABSPATH' ) || exit;

/**
 * Settings.
 */
class Settings {

	const OPTION         = 'csaam_settings';
	const SECRETS_OPTION = 'csaam_secrets';

	/**
	 * Geheimen die via wp-config.php-constanten kunnen worden gezet.
	 *
	 * @var array<string,string>
	 */
	const SECRET_CONSTANTS = array(
		'anthropic_api_key'    => 'CSAAM_ANTHROPIC_API_KEY',
		'google_client_secret' => 'CSAAM_GOOGLE_CLIENT_SECRET',
		'pagespeed_api_key'    => 'CSAAM_PAGESPEED_API_KEY',
		'ads_developer_token'  => 'CSAAM_ADS_DEVELOPER_TOKEN',
	);

	/**
	 * Cache van de geladen instellingen.
	 *
	 * @var array|null
	 */
	private static $cache = null;

	/**
	 * Veldschema. type: text|email|url|list|bool|int|float|select|multiselect.
	 *
	 * @return array<string,array>
	 */
	public static function schema() {
		return array(
			// Bedrijf.
			'company_name'          => array(
				'type'    => 'text',
				'default' => 'Clean Schoonmaakbedrijf B.V.',
			),
			'company_website'       => array(
				'type'    => 'url',
				'default' => 'https://cleanschoonmaakbedrijf.nl',
			),
			'company_city'          => array(
				'type'    => 'text',
				'default' => 'Zeist',
			),
			'company_address'       => array(
				'type'    => 'text',
				'default' => '',
			),
			'company_phone'         => array(
				'type'    => 'text',
				'default' => '',
			),
			'company_usps'          => array(
				'type'    => 'list',
				'default' => array(),
			),
			'cities'                => array(
				'type'    => 'list',
				'default' => array( 'Zeist', 'Utrecht', 'Amersfoort', 'Nieuwegein', 'Bilthoven', 'Houten', 'Driebergen', 'Doorn' ),
			),
			'services'              => array(
				'type'    => 'list',
				'default' => array( 'Kantoorschoonmaak', 'Bedrijfsschoonmaak', 'Glasbewassing', 'VvE-schoonmaak', 'Trappenhuisreiniging', 'Periodieke schoonmaak', 'Vloeronderhoud', 'Opleverschoonmaak' ),
			),
			'target_keywords'       => array(
				'type'    => 'list',
				'default' => array( 'schoonmaakbedrijf zeist', 'kantoorschoonmaak utrecht', 'glasbewassing zeist', 'vve schoonmaak utrecht' ),
			),

			// Algemeen.
			'demo_mode'             => array(
				'type'    => 'bool',
				'default' => false,
			),
			'cache_hours'           => array(
				'type'    => 'int',
				'default' => 6,
				'min'     => 1,
				'max'     => 72,
			),
			'audit_post_types'      => array(
				'type'    => 'multiselect',
				'default' => array( 'page', 'post' ),
			),
			'seo_fallback_meta'     => array(
				'type'    => 'bool',
				'default' => false,
			),

			// AI.
			'ai_provider'           => array(
				'type'    => 'select',
				'default' => 'anthropic',
				'options' => array( 'anthropic' ),
			),
			'ai_model'              => array(
				'type'    => 'select',
				'default' => 'claude-opus-5-5',
				'options' => array( 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5' ),
			),
			'ai_effort'             => array(
				'type'    => 'select',
				'default' => 'medium',
				'options' => array( 'low', 'medium', 'high' ),
			),
			'ai_monthly_budget'     => array(
				'type'    => 'float',
				'default' => 25.0,
				'min'     => 0,
				'max'     => 10000,
			),
			'ai_max_tokens'         => array(
				'type'    => 'int',
				'default' => 16000,
				'min'     => 1000,
				'max'     => 32000,
			),
			'ai_requests_per_hour'  => array(
				'type'    => 'int',
				'default' => 30,
				'min'     => 1,
				'max'     => 500,
			),
			'ai_fallbacks'          => array(
				'type'    => 'bool',
				'default' => true,
			),

			// Google.
			'google_client_id'      => array(
				'type'    => 'text',
				'default' => '',
			),
			'ads_customer_id'       => array(
				'type'    => 'text',
				'default' => '',
			),
			'ads_login_customer_id' => array(
				'type'    => 'text',
				'default' => '',
			),
			'ads_api_version'       => array(
				'type'    => 'text',
				'default' => 'v26',
			),
			'ads_daily_op_limit'    => array(
				'type'    => 'int',
				'default' => 2000,
				'min'     => 10,
				'max'     => 15000,
			),
			'gsc_site_url'          => array(
				'type'    => 'text',
				'default' => '',
			),
			'ga4_property_id'       => array(
				'type'    => 'text',
				'default' => '',
			),

			// Conversies.
			'tracking_enabled'      => array(
				'type'    => 'bool',
				'default' => true,
			),
			'tracking_phone'        => array(
				'type'    => 'bool',
				'default' => true,
			),
			'tracking_email'        => array(
				'type'    => 'bool',
				'default' => true,
			),
			'tracking_whatsapp'     => array(
				'type'    => 'bool',
				'default' => true,
			),
			'tracking_forms'        => array(
				'type'    => 'bool',
				'default' => true,
			),
			'tracking_quote_forms'  => array(
				'type'    => 'list',
				'default' => array( 'offerte' ),
			),
			'tracking_selectors'    => array(
				'type'    => 'list',
				'default' => array(),
			),
			'tracking_datalayer'    => array(
				'type'    => 'select',
				'default' => 'auto',
				'options' => array( 'auto', 'on', 'off' ),
			),
			'tracking_consent'      => array(
				'type'    => 'bool',
				'default' => true,
			),

			// Rapportage en onderhoud.
			'report_email'          => array(
				'type'    => 'email',
				'default' => '',
			),
			'report_monthly'        => array(
				'type'    => 'bool',
				'default' => false,
			),
			'log_retention_days'    => array(
				'type'    => 'int',
				'default' => 30,
				'min'     => 1,
				'max'     => 365,
			),
			'event_retention_days'  => array(
				'type'    => 'int',
				'default' => 400,
				'min'     => 30,
				'max'     => 1095,
			),
		);
	}

	/**
	 * Slaat ontbrekende standaardwaarden op.
	 */
	public static function ensure_defaults() {
		$current = get_option( self::OPTION, array() );
		$current = is_array( $current ) ? $current : array();
		foreach ( self::schema() as $key => $field ) {
			if ( ! array_key_exists( $key, $current ) ) {
				$current[ $key ] = $field['default'];
			}
		}
		update_option( self::OPTION, $current, true );
		self::$cache = null;
	}

	/**
	 * Alle instellingen (met defaults).
	 *
	 * @return array
	 */
	public static function all() {
		if ( null === self::$cache ) {
			$stored = get_option( self::OPTION, array() );
			$stored = is_array( $stored ) ? $stored : array();
			$out    = array();
			foreach ( self::schema() as $key => $field ) {
				$out[ $key ] = array_key_exists( $key, $stored ) ? $stored[ $key ] : $field['default'];
			}
			self::$cache = $out;
		}
		return self::$cache;
	}

	/**
	 * Eén instelling.
	 *
	 * @param string $key Sleutel.
	 * @return mixed
	 */
	public static function get( $key ) {
		$all = self::all();
		return isset( $all[ $key ] ) ? $all[ $key ] : null;
	}

	/**
	 * Is demomodus actief?
	 *
	 * @return bool
	 */
	public static function demo() {
		return (bool) self::get( 'demo_mode' );
	}

	/**
	 * Sanitizet en slaat instellingen op (alleen bekende sleutels).
	 *
	 * @param array $input Ongefilterde invoer.
	 * @return array Opgeslagen instellingen.
	 */
	public static function save( array $input ) {
		$current = self::all();
		foreach ( self::schema() as $key => $field ) {
			if ( ! array_key_exists( $key, $input ) ) {
				continue; // Formulieren sturen voor elke checkbox een verborgen 0 mee.
			}
			$current[ $key ] = self::sanitize_field( $input[ $key ], $field );
		}
		$current['ads_customer_id']       = preg_replace( '/\D/', '', (string) $current['ads_customer_id'] );
		$current['ads_login_customer_id'] = preg_replace( '/\D/', '', (string) $current['ads_login_customer_id'] );
		$current['ga4_property_id']       = preg_replace( '/\D/', '', (string) $current['ga4_property_id'] );
		if ( ! preg_match( '/^v\d{2,3}$/', (string) $current['ads_api_version'] ) ) {
			$current['ads_api_version'] = 'v26';
		}

		update_option( self::OPTION, $current, true );
		self::$cache = null;
		Cache::flush_group( 'all' );
		return self::all();
	}

	/**
	 * Sanitizet één veld volgens het schema.
	 *
	 * @param mixed $value Waarde.
	 * @param array $field Schemadefinitie.
	 * @return mixed
	 */
	private static function sanitize_field( $value, array $field ) {
		switch ( $field['type'] ) {
			case 'bool':
				return (bool) $value && 'false' !== $value && '0' !== $value;
			case 'int':
				$v = (int) $value;
				return max( $field['min'], min( $field['max'], $v ) );
			case 'float':
				$v = (float) str_replace( ',', '.', (string) $value );
				return max( (float) $field['min'], min( (float) $field['max'], round( $v, 2 ) ) );
			case 'email':
				return sanitize_email( (string) $value );
			case 'url':
				return esc_url_raw( (string) $value );
			case 'select':
				return in_array( $value, $field['options'], true ) ? $value : $field['default'];
			case 'multiselect':
				$value = is_array( $value ) ? $value : explode( ',', (string) $value );
				return array_values( array_filter( array_map( 'sanitize_key', $value ) ) );
			case 'list':
				if ( ! is_array( $value ) ) {
					$value = preg_split( '/\r\n|\r|\n/', (string) $value );
				}
				$value = array_map(
					static function ( $item ) {
						return trim( sanitize_text_field( wp_unslash( (string) $item ) ) );
					},
					$value
				);
				return array_values( array_unique( array_filter( $value, 'strlen' ) ) );
			default:
				return sanitize_text_field( (string) $value );
		}
	}

	/**
	 * Haalt een geheim op (constante in wp-config.php heeft voorrang).
	 *
	 * @param string $name Naam.
	 * @return string
	 */
	public static function secret( $name ) {
		if ( isset( self::SECRET_CONSTANTS[ $name ] ) && defined( self::SECRET_CONSTANTS[ $name ] ) ) {
			return (string) constant( self::SECRET_CONSTANTS[ $name ] );
		}
		$secrets = get_option( self::SECRETS_OPTION, array() );
		return isset( $secrets[ $name ] ) ? Crypto::decrypt( $secrets[ $name ] ) : '';
	}

	/**
	 * Slaat een geheim versleuteld op. Lege waarde = verwijderen.
	 *
	 * @param string $name  Naam.
	 * @param string $value Waarde.
	 */
	public static function set_secret( $name, $value ) {
		$secrets = get_option( self::SECRETS_OPTION, array() );
		$secrets = is_array( $secrets ) ? $secrets : array();
		$value   = trim( (string) $value );
		if ( '' === $value ) {
			unset( $secrets[ $name ] );
		} else {
			$secrets[ $name ] = Crypto::encrypt( $value );
		}
		update_option( self::SECRETS_OPTION, $secrets, false );
	}

	/**
	 * Status van geheimen zonder de waarden zelf prijs te geven.
	 *
	 * @return array<string,array{set:bool,source:string,hint:string}>
	 */
	public static function secret_status() {
		$out = array();
		foreach ( self::SECRET_CONSTANTS as $name => $constant ) {
			$value        = self::secret( $name );
			$out[ $name ] = array(
				'set'    => '' !== $value,
				'source' => defined( $constant ) ? 'wp-config.php' : ( '' !== $value ? 'database (versleuteld)' : '' ),
				'hint'   => strlen( $value ) > 8 ? '••••' . substr( $value, -4 ) : ( '' !== $value ? '••••' : '' ),
			);
		}
		return $out;
	}

	/**
	 * Context over het bedrijf voor AI-prompts.
	 *
	 * @return string
	 */
	public static function business_context() {
		$s     = self::all();
		$lines = array(
			'Bedrijf: ' . $s['company_name'],
			'Website: ' . $s['company_website'],
			'Vestigingsplaats: ' . $s['company_city'] . ', Nederland',
			'Werkgebied: ' . implode( ', ', $s['cities'] ),
			'Diensten: ' . implode( ', ', $s['services'] ),
		);
		if ( $s['company_usps'] ) {
			$lines[] = 'Door de eigenaar bevestigde USP\'s: ' . implode( '; ', $s['company_usps'] );
		}
		return implode( "\n", $lines );
	}
}
