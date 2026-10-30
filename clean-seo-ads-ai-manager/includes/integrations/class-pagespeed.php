<?php
/**
 * PageSpeed Insights API v5 (laadsnelheid, Core Web Vitals, mobiel).
 * Werkt zonder Google-koppeling; een API-sleutel verhoogt het quotum.
 *
 * @package CSAAM
 */

namespace CSAAM\Integrations;

use CSAAM\Cache;
use CSAAM\Demo_Data;
use CSAAM\Http;
use CSAAM\Rate_Limiter;
use CSAAM\Settings;
use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * PageSpeed.
 */
class PageSpeed {

	const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

	/**
	 * Analyseert een URL.
	 *
	 * @param string $url      URL.
	 * @param string $strategy mobile|desktop.
	 * @param bool   $refresh  Cache negeren.
	 * @return array|WP_Error
	 */
	public static function run( $url, $strategy = 'mobile', $refresh = false ) {
		$strategy = 'desktop' === $strategy ? 'desktop' : 'mobile';
		if ( Settings::demo() ) {
			return Demo_Data::pagespeed( $url, $strategy );
		}
		return Cache::remember(
			'pagespeed',
			$strategy . '_' . md5( $url ),
			static function () use ( $url, $strategy ) {
				if ( ! Rate_Limiter::hit( 'pagespeed_minute', 20, MINUTE_IN_SECONDS ) ) {
					return new WP_Error( 'csaam_rate', __( 'Te veel PageSpeed-analyses tegelijk; wacht een minuut.', 'clean-seo-ads-ai' ) );
				}
				$query = 'url=' . rawurlencode( $url ) . '&strategy=' . $strategy . '&locale=nl'
					. '&category=performance&category=seo&category=accessibility&category=best-practices';
				$key   = Settings::secret( 'pagespeed_api_key' );
				if ( '' !== $key ) {
					$query .= '&key=' . rawurlencode( $key );
				}
				$data = Http::json( 'GET', self::ENDPOINT . '?' . $query, array( 'timeout' => 90 ), 'pagespeed' );
				if ( is_wp_error( $data ) ) {
					return $data;
				}
				return self::parse( $data, $strategy );
			},
			$refresh
		);
	}

	/**
	 * Zet het Lighthouse-resultaat om naar een compact formaat.
	 *
	 * @param array  $data     API-antwoord.
	 * @param string $strategy Strategie.
	 * @return array
	 */
	private static function parse( array $data, $strategy ) {
		$lh     = isset( $data['lighthouseResult'] ) ? $data['lighthouseResult'] : array();
		$cats   = isset( $lh['categories'] ) ? $lh['categories'] : array();
		$audits = isset( $lh['audits'] ) ? $lh['audits'] : array();
		$score  = static function ( $key ) use ( $cats ) {
			return isset( $cats[ $key ]['score'] ) ? (int) round( $cats[ $key ]['score'] * 100 ) : null;
		};
		$metric = static function ( $key ) use ( $audits ) {
			return isset( $audits[ $key ]['displayValue'] ) ? $audits[ $key ]['displayValue'] : '';
		};

		$opportunities = array();
		foreach ( $audits as $id => $audit ) {
			if ( isset( $audit['details']['type'] ) && 'opportunity' === $audit['details']['type'] && isset( $audit['score'] ) && $audit['score'] < 0.9 ) {
				$opportunities[] = array(
					'id'      => $id,
					'title'   => $audit['title'],
					'savings' => isset( $audit['displayValue'] ) ? $audit['displayValue'] : '',
				);
			}
		}

		$field = array();
		if ( isset( $data['loadingExperience']['metrics'] ) ) {
			foreach ( $data['loadingExperience']['metrics'] as $name => $m ) {
				$field[ $name ] = array(
					'p75'      => isset( $m['percentile'] ) ? $m['percentile'] : null,
					'category' => isset( $m['category'] ) ? $m['category'] : '',
				);
			}
		}

		return array(
			'strategy'      => $strategy,
			'scores'        => array(
				'performance'    => $score( 'performance' ),
				'seo'            => $score( 'seo' ),
				'accessibility'  => $score( 'accessibility' ),
				'best_practices' => $score( 'best-practices' ),
			),
			'metrics'       => array(
				'LCP' => $metric( 'largest-contentful-paint' ),
				'CLS' => $metric( 'cumulative-layout-shift' ),
				'TBT' => $metric( 'total-blocking-time' ),
				'FCP' => $metric( 'first-contentful-paint' ),
				'SI'  => $metric( 'speed-index' ),
			),
			'field'         => $field,
			'opportunities' => array_slice( $opportunities, 0, 8 ),
			'fetched'       => time(),
		);
	}
}
