<?php
/**
 * Claude (Anthropic Messages API) via de WordPress HTTP API.
 *
 * Er wordt bewust geen Composer-SDK meegeleverd: een WordPress-plugin met
 * gebundelde vendor-libraries botst snel met andere plugins. Het request
 * volgt de Messages API (anthropic-version 2026-10-21) met gestructureerde
 * output (output_config.format) en server-side fallback bij weigeringen.
 *
 * @package CSAAM
 */

namespace CSAAM\AI;

use CSAAM\Http;
use CSAAM\Settings;
use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Anthropic.
 */
class Anthropic implements Provider {

	const ENDPOINT    = 'https://api.anthropic.com/v1/messages';
	const API_VERSION = '2026-10-21';

	/**
	 * Prijzen in USD per miljoen tokens (input, output). Bron: Anthropic-prijslijst.
	 */
	const PRICES = array(
		'claude-opus-5-5'   => array( 4.00, 20.00 ),
		'claude-sonnet-5-5' => array( 2.00, 10.00 ),
		'claude-haiku-5-5'  => array( 0.10, 0.50 ),
		'claude-opus-5'     => array( 5.00, 25.00 ),
		'claude-opus-4-8'   => array( 5.00, 25.00 ),
		'claude-sonnet-5'   => array( 2.00, 10.00 ),
	);

	/**
	 * Modellen die server-side fallback ondersteunen.
	 */
	const FALLBACK_MODELS = array( 'claude-opus-5-5', 'claude-sonnet-5-5' );

	/**
	 * Naam.
	 *
	 * @return string
	 */
	public function label() {
		return 'Claude (Anthropic)';
	}

	/**
	 * Sleutel aanwezig?
	 *
	 * @return bool
	 */
	public function configured() {
		return '' !== Settings::secret( 'anthropic_api_key' );
	}

	/**
	 * Kostenraming in USD.
	 *
	 * @param string $model  Model.
	 * @param int    $input  Input-tokens.
	 * @param int    $output Output-tokens.
	 * @return float
	 */
	public static function cost( $model, $input, $output ) {
		$price = isset( self::PRICES[ $model ] ) ? self::PRICES[ $model ] : self::PRICES['claude-opus-5-5'];
		return ( $input * $price[0] + $output * $price[1] ) / 1000000;
	}

	/**
	 * Gestructureerd verzoek.
	 *
	 * @param string $system System prompt.
	 * @param string $prompt Gebruikersbericht.
	 * @param array  $schema JSON Schema.
	 * @return array|WP_Error
	 */
	public function structured( $system, $prompt, array $schema ) {
		$key = Settings::secret( 'anthropic_api_key' );
		if ( '' === $key ) {
			return new WP_Error( 'csaam_ai_key', __( 'Er is nog geen Claude API-sleutel ingesteld (Instellingen → AI).', 'clean-seo-ads-ai' ) );
		}
		$model   = Settings::get( 'ai_model' );
		$headers = array(
			'x-api-key'         => $key,
			'anthropic-version' => self::API_VERSION,
		);
		$body    = array(
			'model'         => $model,
			'max_tokens'    => (int) Settings::get( 'ai_max_tokens' ),
			'system'        => $system,
			'messages'      => array(
				array(
					'role'    => 'user',
					'content' => $prompt,
				),
			),
			'output_config' => array(
				'effort' => Settings::get( 'ai_effort' ),
				'format' => array(
					'type'   => 'json_schema',
					'schema' => $schema,
				),
			),
		);
		if ( Settings::get( 'ai_fallbacks' ) && in_array( $model, self::FALLBACK_MODELS, true ) ) {
			$headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
			$body['fallbacks']         = 'default';
		}

		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 300 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}
		$response = Http::json(
			'POST',
			self::ENDPOINT,
			array(
				'headers' => $headers,
				'body'    => $body,
				'timeout' => 240,
			),
			'ai'
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}

		list( $input, $output, $cost ) = $this->usage( $response, $model );
		$used_model                    = isset( $response['model'] ) ? (string) $response['model'] : $model;
		$base                          = array(
			'model'         => $used_model,
			'input_tokens'  => $input,
			'output_tokens' => $output,
			'cost'          => $cost,
		);

		$stop = isset( $response['stop_reason'] ) ? $response['stop_reason'] : '';
		if ( 'refusal' === $stop ) {
			return new WP_Error( 'csaam_ai_refusal', __( 'Claude heeft dit verzoek geweigerd. Pas de pagina-inhoud of de opdracht aan en probeer het opnieuw.', 'clean-seo-ads-ai' ), $base );
		}
		if ( 'max_tokens' === $stop ) {
			return new WP_Error( 'csaam_ai_truncated', __( 'Het AI-antwoord werd afgekapt. Verhoog "Max. tokens per verzoek" bij Instellingen → AI of kies een kortere pagina.', 'clean-seo-ads-ai' ), $base );
		}

		$text = '';
		foreach ( isset( $response['content'] ) ? $response['content'] : array() as $block ) {
			if ( isset( $block['type'] ) && 'text' === $block['type'] ) {
				$text .= $block['text'];
			}
		}
		$data = json_decode( $text, true );
		if ( ! is_array( $data ) ) {
			return new WP_Error( 'csaam_ai_format', __( 'Het AI-antwoord had een onverwacht formaat. Probeer het opnieuw.', 'clean-seo-ads-ai' ), $base );
		}
		$base['data'] = $data;
		return $base;
	}

	/**
	 * Tokens en kosten, inclusief eventuele fallback-pogingen.
	 *
	 * @param array  $response Antwoord.
	 * @param string $model    Aangevraagd model.
	 * @return array{0:int,1:int,2:float}
	 */
	private function usage( array $response, $model ) {
		$usage = isset( $response['usage'] ) ? $response['usage'] : array();
		if ( ! empty( $usage['iterations'] ) && is_array( $usage['iterations'] ) ) {
			$in   = 0;
			$out  = 0;
			$cost = 0.0;
			foreach ( $usage['iterations'] as $it ) {
				$i     = isset( $it['input_tokens'] ) ? (int) $it['input_tokens'] : 0;
				$o     = isset( $it['output_tokens'] ) ? (int) $it['output_tokens'] : 0;
				$m     = isset( $it['model'] ) ? (string) $it['model'] : ( isset( $response['model'] ) ? $response['model'] : $model );
				$in   += $i;
				$out  += $o;
				$cost += self::cost( $m, $i, $o );
			}
			return array( $in, $out, $cost );
		}
		$in  = isset( $usage['input_tokens'] ) ? (int) $usage['input_tokens'] : 0;
		$out = isset( $usage['output_tokens'] ) ? (int) $usage['output_tokens'] : 0;
		$in += isset( $usage['cache_read_input_tokens'] ) ? (int) $usage['cache_read_input_tokens'] : 0;
		$in += isset( $usage['cache_creation_input_tokens'] ) ? (int) $usage['cache_creation_input_tokens'] : 0;
		return array( $in, $out, self::cost( isset( $response['model'] ) ? $response['model'] : $model, $in, $out ) );
	}
}
