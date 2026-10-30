<?php
/**
 * HTTP-wrapper rond de WordPress HTTP API met JSON, foutvertaling en backoff.
 *
 * @package CSAAM
 */

namespace CSAAM;

use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Http.
 */
class Http {

	/**
	 * Voert een JSON-request uit.
	 *
	 * @param string $method  GET|POST.
	 * @param string $url     URL.
	 * @param array  $args    headers, body (array => JSON), timeout.
	 * @param string $channel Log-/rate-limitkanaal.
	 * @return array|WP_Error Gedecodeerde JSON.
	 */
	public static function json( $method, $url, array $args, $channel ) {
		$cool = Rate_Limiter::cooling( $channel );
		if ( $cool > 0 ) {
			/* translators: %d: seconden */
			return new WP_Error( 'csaam_cooldown', sprintf( __( 'De API heeft tijdelijk te veel verzoeken ontvangen. Probeer het over %d seconden opnieuw.', 'clean-seo-ads-ai' ), $cool ) );
		}

		$headers = isset( $args['headers'] ) ? $args['headers'] : array();
		$request = array(
			'method'      => $method,
			'timeout'     => isset( $args['timeout'] ) ? (int) $args['timeout'] : 30,
			'headers'     => $headers,
			'redirection' => 2,
			'user-agent'  => 'CleanSEOAdsAIManager/' . CSAAM_VERSION . '; ' . home_url( '/' ),
		);
		if ( isset( $args['body'] ) ) {
			$request['body']                    = is_array( $args['body'] ) ? wp_json_encode( $args['body'] ) : $args['body'];
			$request['headers']['Content-Type'] = isset( $headers['Content-Type'] ) ? $headers['Content-Type'] : 'application/json';
		}

		$started  = microtime( true );
		$response = wp_remote_request( $url, $request );
		$ms       = (int) round( ( microtime( true ) - $started ) * 1000 );

		if ( is_wp_error( $response ) ) {
			Logger::error(
				$channel,
				'Verbindingsfout',
				array(
					'error_code' => $response->get_error_code(),
					'ms'         => $ms,
				)
			);
			return new WP_Error( 'csaam_http', __( 'Kon geen verbinding maken met de externe dienst. Controleer de serververbinding en probeer het later opnieuw.', 'clean-seo-ads-ai' ) );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );

		if ( 429 === $code || 503 === $code ) {
			$retry = (int) wp_remote_retrieve_header( $response, 'retry-after' );
			Rate_Limiter::cool_down( $channel, $retry > 0 ? min( $retry, 3600 ) : 60 );
		}

		if ( $code < 200 || $code >= 300 ) {
			$message = self::error_message( $data );
			Logger::warning(
				$channel,
				'API-fout',
				array(
					'status_code' => $code,
					'detail'      => mb_substr( $message, 0, 300 ),
					'ms'          => $ms,
				)
			);
			return new WP_Error( 'csaam_api_' . $code, self::friendly( $code, $message ), array( 'status' => $code ) );
		}

		if ( ! is_array( $data ) ) {
			Logger::warning( $channel, 'Ongeldig JSON-antwoord', array( 'status_code' => $code ) );
			return new WP_Error( 'csaam_json', __( 'De externe dienst gaf een onverwacht antwoord.', 'clean-seo-ads-ai' ) );
		}
		return $data;
	}

	/**
	 * Haalt de foutmelding uit Google-/Anthropic-foutformaten.
	 *
	 * @param mixed $data Gedecodeerde body.
	 * @return string
	 */
	private static function error_message( $data ) {
		if ( ! is_array( $data ) ) {
			return '';
		}
		if ( isset( $data[0]['error'] ) ) { // Google Ads searchStream-fouten komen als array.
			$data = $data[0];
		}
		if ( isset( $data['error']['details'][0]['errors'][0]['message'] ) ) { // Google Ads failure-details.
			return (string) $data['error']['details'][0]['errors'][0]['message'];
		}
		if ( isset( $data['error']['message'] ) ) {
			return (string) $data['error']['message'];
		}
		if ( isset( $data['error_description'] ) ) {
			return (string) $data['error_description'];
		}
		if ( isset( $data['error'] ) && is_string( $data['error'] ) ) {
			return $data['error'];
		}
		return '';
	}

	/**
	 * Nederlandse foutmelding met de technische reden erachter.
	 *
	 * @param int    $code    HTTP-status.
	 * @param string $message API-melding.
	 * @return string
	 */
	private static function friendly( $code, $message ) {
		switch ( $code ) {
			case 400:
				$text = __( 'Ongeldig verzoek.', 'clean-seo-ads-ai' );
				break;
			case 401:
				$text = __( 'Niet geautoriseerd: de koppeling is verlopen of de sleutel is ongeldig. Koppel het account opnieuw of controleer de API-sleutel.', 'clean-seo-ads-ai' );
				break;
			case 403:
				$text = __( 'Geen toegang. Controleer of de API is ingeschakeld in uw Google Cloud-project en of het account rechten heeft.', 'clean-seo-ads-ai' );
				break;
			case 404:
				$text = __( 'Niet gevonden. Controleer het ingestelde ID of de URL.', 'clean-seo-ads-ai' );
				break;
			case 429:
				$text = __( 'Te veel verzoeken of quotum bereikt. De plugin wacht automatisch voordat het opnieuw wordt geprobeerd.', 'clean-seo-ads-ai' );
				break;
			default:
				/* translators: %d: HTTP-statuscode */
				$text = sprintf( __( 'De externe dienst gaf een fout (HTTP %d).', 'clean-seo-ads-ai' ), $code );
		}
		$message = Logger::redact( $message );
		return $message ? $text . ' (' . mb_substr( $message, 0, 300 ) . ')' : $text;
	}
}
