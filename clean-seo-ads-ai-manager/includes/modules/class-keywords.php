<?php
/**
 * Zoekwoordanalyse op basis van echte Search Console-gegevens: doelzoekwoorden,
 * kansen (positie 4–20), lage CTR, kannibalisatie en lokale zoekopdrachten.
 *
 * @package CSAAM
 */

namespace CSAAM\Modules;

use CSAAM\Integrations\Google_Ads;
use CSAAM\Integrations\Search_Console;
use CSAAM\Settings;
use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Keywords.
 */
class Keywords {

	/**
	 * Indicatieve CTR per positie (%), voor het signaleren van lage CTR.
	 */
	const EXPECTED_CTR = array(
		1  => 25,
		2  => 14,
		3  => 9,
		4  => 6,
		5  => 4.5,
		6  => 3.5,
		7  => 3,
		8  => 2.5,
		9  => 2,
		10 => 1.8,
	);

	/**
	 * Analyse.
	 *
	 * @param int  $days    Periode.
	 * @param bool $refresh Cache negeren.
	 * @return array|WP_Error
	 */
	public static function analyze( $days = 28, $refresh = false ) {
		$gsc = Search_Console::overview( $days, $refresh );
		if ( is_wp_error( $gsc ) ) {
			return $gsc;
		}
		$queries = $gsc['queries'];
		$pairs   = $gsc['pairs'];
		$cities  = array_map( array( Local_SEO::class, 'norm' ), (array) Settings::get( 'cities' ) );

		// Beste pagina per zoekopdracht en kannibalisatie.
		$by_query = array();
		foreach ( $pairs as $p ) {
			$by_query[ $p['keys'][0] ][] = $p;
		}
		$best_page = array();
		$cannibal  = array();
		foreach ( $by_query as $q => $rows ) {
			usort(
				$rows,
				static function ( $a, $b ) {
					return $b['impressions'] - $a['impressions'];
				}
			);
			$best_page[ $q ] = $rows[0]['keys'][1];
			$total           = array_sum( wp_list_pluck( $rows, 'impressions' ) );
			$relevant        = array_filter(
				$rows,
				static function ( $r ) use ( $total ) {
					return $total > 0 && $r['impressions'] / $total >= 0.15;
				}
			);
			if ( count( $relevant ) > 1 && $total >= 30 ) {
				$cannibal[] = array(
					'query'       => $q,
					'impressions' => $total,
					'pages'       => array_map(
						static function ( $r ) {
							return array(
								'url'         => $r['keys'][1],
								'impressions' => $r['impressions'],
								'position'    => $r['position'],
							);
						},
						array_values( $relevant )
					),
				);
			}
		}

		// Doelzoekwoorden.
		$tracked = array();
		foreach ( (array) Settings::get( 'target_keywords' ) as $kw ) {
			$norm  = Local_SEO::norm( $kw );
			$match = null;
			foreach ( $queries as $q ) {
				if ( Local_SEO::norm( $q['keys'][0] ) === $norm ) {
					$match = $q;
					break;
				}
			}
			$variants  = array_values(
				array_filter(
					$queries,
					static function ( $q ) use ( $norm ) {
						return $norm && false !== strpos( Local_SEO::norm( $q['keys'][0] ), $norm ) && Local_SEO::norm( $q['keys'][0] ) !== $norm;
					}
				)
			);
			$tracked[] = array(
				'keyword'     => $kw,
				'found'       => (bool) $match,
				'clicks'      => $match ? $match['clicks'] : 0,
				'impressions' => $match ? $match['impressions'] : 0,
				'ctr'         => $match ? $match['ctr'] : 0,
				'position'    => $match ? $match['position'] : null,
				'page'        => $match && isset( $best_page[ $match['keys'][0] ] ) ? $best_page[ $match['keys'][0] ] : '',
				'variants'    => count( $variants ),
			);
		}

		$opportunities = array();
		$low_ctr       = array();
		$local         = array();
		foreach ( $queries as $q ) {
			$query = $q['keys'][0];
			$row   = array_merge(
				$q,
				array(
					'query' => $query,
					'page'  => isset( $best_page[ $query ] ) ? $best_page[ $query ] : '',
				)
			);
			if ( $q['position'] >= 4 && $q['position'] <= 20 && $q['impressions'] >= 20 ) {
				$opportunities[] = $row;
			}
			$pos = (int) round( $q['position'] );
			if ( $pos >= 1 && $pos <= 10 && $q['impressions'] >= 50 && $q['ctr'] < self::EXPECTED_CTR[ $pos ] * 0.6 ) {
				$row['expected_ctr'] = self::EXPECTED_CTR[ $pos ];
				$low_ctr[]           = $row;
			}
			$nq = Local_SEO::norm( $query );
			foreach ( $cities as $c ) {
				if ( $c && false !== strpos( ' ' . $nq . ' ', ' ' . $c . ' ' ) ) {
					$row['city'] = $c;
					$local[]     = $row;
					break;
				}
			}
		}
		usort(
			$opportunities,
			static function ( $a, $b ) {
				return $b['impressions'] - $a['impressions'];
			}
		);

		// Overlap met Google Ads-zoekwoorden (organisch al sterk).
		$overlap = array();
		$ads     = Google_Ads::overview( $days );
		if ( ! is_wp_error( $ads ) ) {
			$organic = array();
			foreach ( $queries as $q ) {
				$organic[ Local_SEO::norm( $q['keys'][0] ) ] = $q;
			}
			foreach ( $ads['keywords'] as $k ) {
				$n = Local_SEO::norm( $k['keyword'] );
				if ( isset( $organic[ $n ] ) ) {
					$overlap[] = array(
						'keyword'          => $k['keyword'],
						'ads_cost'         => $k['cost'],
						'ads_conversions'  => $k['conversions'],
						'organic_position' => $organic[ $n ]['position'],
						'organic_clicks'   => $organic[ $n ]['clicks'],
					);
				}
			}
		}

		return array(
			'demo'          => ! empty( $gsc['demo'] ),
			'period'        => $gsc['period'],
			'tracked'       => $tracked,
			'opportunities' => array_slice( $opportunities, 0, 50 ),
			'low_ctr'       => array_slice( $low_ctr, 0, 30 ),
			'cannibal'      => array_slice( $cannibal, 0, 30 ),
			'local'         => array_slice( $local, 0, 50 ),
			'overlap'       => $overlap,
			'top'           => array_slice( $queries, 0, 100 ),
		);
	}
}
