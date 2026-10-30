<?php
/**
 * Google OAuth 2.0 (webserver-flow met state + PKCE). Eén koppeling voor
 * Google Ads, Search Console en Analytics, met alleen-lezen scopes waar
 * Google die aanbiedt. De Ads-scope bestaat alleen als volledige scope; de
 * plugin bevat daarom bewust geen enkele schrijfaanroep (mutate) naar Ads.
 *
 * @package CSAAM
 */

namespace CSAAM\Integrations;

use CSAAM\Crypto;
use CSAAM\Http;
use CSAAM\Logger;
use CSAAM\Settings;
use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Google_OAuth.
 */
class Google_OAuth {

	const AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth';
	const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
	const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
	const OPTION     = 'csaam_google_tokens';

	const SCOPES = array(
		'https://www.googleapis.com/auth/adwords',
		'https://www.googleapis.com/auth/webmasters.readonly',
		'https://www.googleapis.com/auth/analytics.readonly',
	);

	/**
	 * Hooks.
	 */
	public static function register() {
		add_action( 'admin_post_csaam_google_connect', array( __CLASS__, 'start' ) );
		add_action( 'admin_post_csaam_google_callback', array( __CLASS__, 'callback' ) );
		add_action( 'admin_post_csaam_google_disconnect', array( __CLASS__, 'disconnect' ) );
	}

	/**
	 * Redirect-URI die in Google Cloud moet worden geregistreerd.
	 *
	 * @return string
	 */
	public static function redirect_uri() {
		return admin_url( 'admin-post.php?action=csaam_google_callback' );
	}

	/**
	 * Is er een geldige koppeling?
	 *
	 * @return bool
	 */
	public static function connected() {
		$tokens = self::tokens();
		return ! empty( $tokens['refresh_token'] );
	}

	/**
	 * Gekoppelde scopes en tijdstip (zonder tokens).
	 *
	 * @return array
	 */
	public static function status() {
		$tokens = self::tokens();
		return array(
			'configured'   => '' !== Settings::get( 'google_client_id' ) && '' !== Settings::secret( 'google_client_secret' ),
			'connected'    => ! empty( $tokens['refresh_token'] ),
			'scopes'       => isset( $tokens['scope'] ) ? explode( ' ', $tokens['scope'] ) : array(),
			'connected_at' => isset( $tokens['connected_at'] ) ? (int) $tokens['connected_at'] : 0,
			'redirect_uri' => self::redirect_uri(),
		);
	}

	/**
	 * Heeft de koppeling een bepaalde scope?
	 *
	 * @param string $scope Scope.
	 * @return bool
	 */
	public static function has_scope( $scope ) {
		return in_array( $scope, self::status()['scopes'], true );
	}

	/**
	 * Ontsleutelde tokens.
	 *
	 * @return array
	 */
	private static function tokens() {
		$raw = get_option( self::OPTION, '' );
		if ( ! $raw ) {
			return array();
		}
		$data = json_decode( Crypto::decrypt( $raw ), true );
		return is_array( $data ) ? $data : array();
	}

	/**
	 * Versleuteld opslaan.
	 *
	 * @param array $tokens Tokens.
	 */
	private static function save_tokens( array $tokens ) {
		update_option( self::OPTION, Crypto::encrypt( wp_json_encode( $tokens ) ), false );
	}

	/**
	 * Start de OAuth-flow.
	 */
	public static function start() {
		if ( ! current_user_can( CSAAM_CAP ) ) {
			wp_die( esc_html__( 'Geen toegang.', 'clean-seo-ads-ai' ), 403 );
		}
		check_admin_referer( 'csaam_google_connect' );

		$client_id = Settings::get( 'google_client_id' );
		if ( '' === $client_id || '' === Settings::secret( 'google_client_secret' ) ) {
			self::back( 'error', __( 'Vul eerst de OAuth Client ID en Client Secret in.', 'clean-seo-ads-ai' ) );
		}

		$state    = wp_generate_password( 32, false );
		$verifier = wp_generate_password( 64, false );
		set_transient(
			'csaam_oauth_' . get_current_user_id(),
			array(
				'state'    => $state,
				'verifier' => $verifier,
			),
			15 * MINUTE_IN_SECONDS
		);

		$challenge = rtrim( strtr( base64_encode( hash( 'sha256', $verifier, true ) ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		$url       = add_query_arg(
			array(
				'client_id'              => rawurlencode( $client_id ),
				'redirect_uri'           => rawurlencode( self::redirect_uri() ),
				'response_type'          => 'code',
				'scope'                  => rawurlencode( implode( ' ', self::SCOPES ) ),
				'access_type'            => 'offline',
				'prompt'                 => 'consent',
				'include_granted_scopes' => 'true',
				'state'                  => $state,
				'code_challenge'         => $challenge,
				'code_challenge_method'  => 'S256',
			),
			self::AUTH_URL
		);
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- externe Google-URL.
		exit;
	}

	/**
	 * Verwerkt de terugkeer van Google.
	 */
	public static function callback() {
		if ( ! current_user_can( CSAAM_CAP ) ) {
			wp_die( esc_html__( 'Geen toegang.', 'clean-seo-ads-ai' ), 403 );
		}
		$saved = get_transient( 'csaam_oauth_' . get_current_user_id() );
		delete_transient( 'csaam_oauth_' . get_current_user_id() );

		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- OAuth-state vervult de nonce-rol.
		$state = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : '';
		$code  = isset( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : '';
		$error = isset( $_GET['error'] ) ? sanitize_text_field( wp_unslash( $_GET['error'] ) ) : '';
		// phpcs:enable

		if ( $error ) {
			/* translators: %s: foutcode van Google */
			self::back( 'error', sprintf( __( 'Google weigerde de koppeling: %s', 'clean-seo-ads-ai' ), $error ) );
		}
		if ( ! is_array( $saved ) || ! hash_equals( $saved['state'], $state ) || '' === $code ) {
			self::back( 'error', __( 'Ongeldige of verlopen koppelpoging. Probeer het opnieuw.', 'clean-seo-ads-ai' ) );
		}

		$result = Http::json(
			'POST',
			self::TOKEN_URL,
			array(
				'headers' => array( 'Content-Type' => 'application/x-www-form-urlencoded' ),
				'body'    => http_build_query(
					array(
						'code'          => $code,
						'client_id'     => Settings::get( 'google_client_id' ),
						'client_secret' => Settings::secret( 'google_client_secret' ),
						'redirect_uri'  => self::redirect_uri(),
						'grant_type'    => 'authorization_code',
						'code_verifier' => $saved['verifier'],
					)
				),
			),
			'google_oauth'
		);
		if ( is_wp_error( $result ) ) {
			self::back( 'error', $result->get_error_message() );
		}
		if ( empty( $result['refresh_token'] ) ) {
			self::back( 'error', __( 'Google gaf geen refresh token terug. Verwijder de toegang van deze app in uw Google-account en koppel opnieuw.', 'clean-seo-ads-ai' ) );
		}

		self::save_tokens(
			array(
				'access_token'  => $result['access_token'],
				'expires_at'    => time() + (int) $result['expires_in'] - 60,
				'refresh_token' => $result['refresh_token'],
				'scope'         => isset( $result['scope'] ) ? $result['scope'] : implode( ' ', self::SCOPES ),
				'connected_at'  => time(),
			)
		);
		\CSAAM\Cache::flush_group( 'google' );
		Logger::info( 'google_oauth', 'Google-account gekoppeld', array( 'user' => get_current_user_id() ) );
		self::back( 'success', __( 'Google-account gekoppeld. Kies hieronder het Search Console-domein, de GA4-property en het Google Ads-account.', 'clean-seo-ads-ai' ) );
	}

	/**
	 * Ontkoppelt en trekt het token in bij Google.
	 */
	public static function disconnect() {
		if ( ! current_user_can( CSAAM_CAP ) ) {
			wp_die( esc_html__( 'Geen toegang.', 'clean-seo-ads-ai' ), 403 );
		}
		check_admin_referer( 'csaam_google_disconnect' );
		$tokens = self::tokens();
		if ( ! empty( $tokens['refresh_token'] ) ) {
			wp_remote_post(
				self::REVOKE_URL,
				array(
					'timeout' => 10,
					'body'    => array( 'token' => $tokens['refresh_token'] ),
				)
			);
		}
		delete_option( self::OPTION );
		\CSAAM\Cache::flush_group( 'google' );
		Logger::info( 'google_oauth', 'Google-account ontkoppeld', array( 'user' => get_current_user_id() ) );
		self::back( 'success', __( 'Google-account ontkoppeld en toegang ingetrokken.', 'clean-seo-ads-ai' ) );
	}

	/**
	 * Geldig access token (vernieuwt indien nodig).
	 *
	 * @return string|WP_Error
	 */
	public static function access_token() {
		$tokens = self::tokens();
		if ( empty( $tokens['refresh_token'] ) ) {
			return new WP_Error( 'csaam_not_connected', __( 'Er is nog geen Google-account gekoppeld (Instellingen → Google-koppeling).', 'clean-seo-ads-ai' ) );
		}
		if ( ! empty( $tokens['access_token'] ) && $tokens['expires_at'] > time() ) {
			return $tokens['access_token'];
		}
		$result = Http::json(
			'POST',
			self::TOKEN_URL,
			array(
				'headers' => array( 'Content-Type' => 'application/x-www-form-urlencoded' ),
				'body'    => http_build_query(
					array(
						'client_id'     => Settings::get( 'google_client_id' ),
						'client_secret' => Settings::secret( 'google_client_secret' ),
						'refresh_token' => $tokens['refresh_token'],
						'grant_type'    => 'refresh_token',
					)
				),
			),
			'google_oauth'
		);
		if ( is_wp_error( $result ) ) {
			$data = $result->get_error_data();
			if ( is_array( $data ) && isset( $data['status'] ) && 400 === (int) $data['status'] ) {
				return new WP_Error( 'csaam_token_revoked', __( 'De Google-koppeling is verlopen of ingetrokken. Koppel het account opnieuw. Tip: zet het OAuth-toestemmingsscherm op "In productie", anders verlopen tokens na 7 dagen.', 'clean-seo-ads-ai' ) );
			}
			return $result;
		}
		$tokens['access_token'] = $result['access_token'];
		$tokens['expires_at']   = time() + (int) $result['expires_in'] - 60;
		self::save_tokens( $tokens );
		return $tokens['access_token'];
	}

	/**
	 * Terug naar de instellingenpagina met melding.
	 *
	 * @param string $type    success|error.
	 * @param string $message Melding.
	 */
	private static function back( $type, $message ) {
		set_transient(
			'csaam_notice_' . get_current_user_id(),
			array(
				'type'    => $type,
				'message' => $message,
			),
			60
		);
		wp_safe_redirect( admin_url( 'admin.php?page=csaam-settings#google' ) );
		exit;
	}
}
