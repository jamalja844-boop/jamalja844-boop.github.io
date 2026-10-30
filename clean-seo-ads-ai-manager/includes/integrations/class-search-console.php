<?php
/**
 * Google Search Console API (alleen-lezen): zoekprestaties, sitemaps en
 * URL-inspectie.
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
 * Search_Console.
 */
class Search_Console {

	const BASE    = 'https://www.googleapis.com/webmasters/v3/';
	const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

	/**
	 * Klaar voor gebruik?
	 *
	 * @return bool
	 */
	public static function ready() {
		return Google_OAuth::connected() && '' !== Settings::get( 'gsc_site_url' );
	}

	/**
	 * Geautoriseerd request.
	 *
	 * @param string     $method Methode.
	 * @param string     $url    URL.
	 * @param array|null $body   Body.
	 * @return array|WP_Error
	 */
	private static function call( $method, $url, $body = null ) {
		$token = Google_OAuth::access_token();
		if ( is_wp_error( $token ) ) {
			return $token;
		}
		if ( ! Rate_Limiter::hit( 'gsc_minute', 300, MINUTE_IN_SECONDS ) ) {
			return new WP_Error( 'csaam_rate', __( 'Te veel Search Console-verzoeken; probeer het over een minuut opnieuw.', 'clean-seo-ads-ai' ) );
		}
		$args = array( 'headers' => array( 'Authorization' => 'Bearer ' . $token ) );
		if ( null !== $body ) {
			$args['body'] = $body;
		}
		return Http::json( $method, $url, $args, 'search_console' );
	}

	/**
	 * Beschikbare properties.
	 *
	 * @return array|WP_Error
	 */
	public static function sites() {
		$data = self::call( 'GET', self::BASE . 'sites' );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$out = array();
		foreach ( isset( $data['siteEntry'] ) ? $data['siteEntry'] : array() as $site ) {
			if ( 'siteUnverifiedUser' !== $site['permissionLevel'] ) {
				$out[] = $site['siteUrl'];
			}
		}
		sort( $out );
		return $out;
	}

	/**
	 * Datumbereik; GSC-gegevens lopen ±3 dagen achter.
	 *
	 * @param int $days   Dagen.
	 * @param int $offset Extra verschuiving in dagen (vorige periode).
	 * @return array{0:string,1:string}
	 */
	public static function range( $days, $offset = 0 ) {
		$end   = current_time( 'timestamp' ) - ( 3 + $offset ) * DAY_IN_SECONDS; // phpcs:ignore WordPress.DateTime.CurrentTimeTimestamp.Requested
		$start = $end - ( $days - 1 ) * DAY_IN_SECONDS;
		return array( gmdate( 'Y-m-d', $start ), gmdate( 'Y-m-d', $end ) );
	}

	/**
	 * Search Analytics-query.
	 *
	 * @param array $range      [start, end].
	 * @param array $dimensions Dimensies.
	 * @param int   $limit      Max. rijen.
	 * @param array $filters    dimensionFilterGroups-filters.
	 * @return array|WP_Error
	 */
	public static function query( array $range, array $dimensions, $limit = 250, array $filters = array() ) {
		$body = array(
			'startDate'  => $range[0],
			'endDate'    => $range[1],
			'dimensions' => $dimensions,
			'rowLimit'   => min( 25000, $limit ),
			'dataState'  => 'final',
		);
		if ( $filters ) {
			$body['dimensionFilterGroups'] = array( array( 'filters' => $filters ) );
		}
		$data = self::call( 'POST', self::BASE . 'sites/' . rawurlencode( Settings::get( 'gsc_site_url' ) ) . '/searchAnalytics/query', $body );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$rows = array();
		foreach ( isset( $data['rows'] ) ? $data['rows'] : array() as $row ) {
			$rows[] = array(
				'keys'        => $row['keys'],
				'clicks'      => (int) $row['clicks'],
				'impressions' => (int) $row['impressions'],
				'ctr'         => round( $row['ctr'] * 100, 2 ),
				'position'    => round( $row['position'], 1 ),
			);
		}
		return $rows;
	}

	/**
	 * Overzicht met totalen, vergelijking, zoekwoorden en pagina's.
	 *
	 * @param int  $days    Periode.
	 * @param bool $refresh Cache negeren.
	 * @return array|WP_Error
	 */
	public static function overview( $days = 28, $refresh = false ) {
		if ( Settings::demo() ) {
			return Demo_Data::gsc( $days );
		}
		if ( ! self::ready() ) {
			return new WP_Error( 'csaam_not_configured', __( 'Search Console is nog niet gekoppeld. Koppel uw Google-account en kies de property bij Instellingen.', 'clean-seo-ads-ai' ) );
		}
		return Cache::remember(
			'google',
			'gsc_overview_' . $days . '_' . md5( Settings::get( 'gsc_site_url' ) ),
			static function () use ( $days ) {
				$range = self::range( $days );
				$prev  = self::range( $days, $days );
				$daily = self::query( $range, array( 'date' ), 500 );
				if ( is_wp_error( $daily ) ) {
					return $daily;
				}
				$prev_daily = self::query( $prev, array( 'date' ), 500 );
				$queries    = self::query( $range, array( 'query' ), 500 );
				$pages      = self::query( $range, array( 'page' ), 250 );
				$pairs      = self::query( $range, array( 'query', 'page' ), 2000 );
				$devices    = self::query( $range, array( 'device' ), 10 );

				return array(
					'demo'     => false,
					'period'   => $range,
					'totals'   => self::totals( $daily ),
					'previous' => is_wp_error( $prev_daily ) ? null : self::totals( $prev_daily ),
					'daily'    => array_map(
						static function ( $r ) {
							return array(
								'date'        => $r['keys'][0],
								'clicks'      => $r['clicks'],
								'impressions' => $r['impressions'],
								'position'    => $r['position'],
							);
						},
						$daily
					),
					'queries'  => is_wp_error( $queries ) ? array() : $queries,
					'pages'    => is_wp_error( $pages ) ? array() : $pages,
					'pairs'    => is_wp_error( $pairs ) ? array() : $pairs,
					'devices'  => is_wp_error( $devices ) ? array() : $devices,
					'fetched'  => time(),
				);
			},
			$refresh
		);
	}

	/**
	 * Totalen uit dagrijen.
	 *
	 * @param array $rows Rijen.
	 * @return array
	 */
	private static function totals( array $rows ) {
		$clicks = array_sum( wp_list_pluck( $rows, 'clicks' ) );
		$impr   = array_sum( wp_list_pluck( $rows, 'impressions' ) );
		$pos    = 0;
		foreach ( $rows as $r ) {
			$pos += $r['position'] * $r['impressions'];
		}
		return array(
			'clicks'      => $clicks,
			'impressions' => $impr,
			'ctr'         => $impr ? round( $clicks / $impr * 100, 2 ) : 0,
			'position'    => $impr ? round( $pos / $impr, 1 ) : 0,
		);
	}

	/**
	 * Zoekwoorden voor één pagina-URL (voor AI-context).
	 *
	 * @param string $url URL.
	 * @return array
	 */
	public static function queries_for_page( $url ) {
		if ( Settings::demo() || ! self::ready() ) {
			return array();
		}
		$rows = Cache::remember(
			'google',
			'gsc_page_' . md5( $url ),
			static function () use ( $url ) {
				return self::query(
					self::range( 90 ),
					array( 'query' ),
					50,
					array(
						array(
							'dimension'  => 'page',
							'operator'   => 'equals',
							'expression' => $url,
						),
					)
				);
			}
		);
		return is_wp_error( $rows ) ? array() : $rows;
	}

	/**
	 * Ingediende sitemaps.
	 *
	 * @return array|WP_Error
	 */
	public static function sitemaps() {
		if ( Settings::demo() ) {
			return Demo_Data::gsc_sitemaps();
		}
		if ( ! self::ready() ) {
			return new WP_Error( 'csaam_not_configured', __( 'Search Console is niet gekoppeld.', 'clean-seo-ads-ai' ) );
		}
		return Cache::remember(
			'google',
			'gsc_sitemaps_' . md5( Settings::get( 'gsc_site_url' ) ),
			static function () {
				$data = self::call( 'GET', self::BASE . 'sites/' . rawurlencode( Settings::get( 'gsc_site_url' ) ) . '/sitemaps' );
				if ( is_wp_error( $data ) ) {
					return $data;
				}
				$out = array();
				foreach ( isset( $data['sitemap'] ) ? $data['sitemap'] : array() as $s ) {
					$out[] = array(
						'path'      => $s['path'],
						'submitted' => isset( $s['lastSubmitted'] ) ? $s['lastSubmitted'] : '',
						'errors'    => isset( $s['errors'] ) ? (int) $s['errors'] : 0,
						'warnings'  => isset( $s['warnings'] ) ? (int) $s['warnings'] : 0,
						'pending'   => ! empty( $s['isPending'] ),
					);
				}
				return $out;
			}
		);
	}

	/**
	 * URL-inspectie (indexstatus volgens Google).
	 *
	 * @param string $url URL.
	 * @return array|WP_Error
	 */
	public static function inspect( $url ) {
		if ( Settings::demo() ) {
			return Demo_Data::inspection( $url );
		}
		if ( ! self::ready() ) {
			return new WP_Error( 'csaam_not_configured', __( 'Search Console is niet gekoppeld.', 'clean-seo-ads-ai' ) );
		}
		if ( ! Rate_Limiter::hit( 'gsc_inspect_day', 1800, DAY_IN_SECONDS ) ) {
			return new WP_Error( 'csaam_rate', __( 'Daglimiet voor URL-inspecties bereikt.', 'clean-seo-ads-ai' ) );
		}
		return Cache::remember(
			'google',
			'gsc_inspect_' . md5( $url ),
			static function () use ( $url ) {
				$data = self::call(
					'POST',
					self::INSPECT,
					array(
						'inspectionUrl' => $url,
						'siteUrl'       => Settings::get( 'gsc_site_url' ),
						'languageCode'  => 'nl-NL',
					)
				);
				if ( is_wp_error( $data ) ) {
					return $data;
				}
				$r = isset( $data['inspectionResult']['indexStatusResult'] ) ? $data['inspectionResult']['indexStatusResult'] : array();
				return array(
					'verdict'          => isset( $r['verdict'] ) ? $r['verdict'] : '',
					'coverage'         => isset( $r['coverageState'] ) ? $r['coverageState'] : '',
					'indexing'         => isset( $r['indexingState'] ) ? $r['indexingState'] : '',
					'robots'           => isset( $r['robotsTxtState'] ) ? $r['robotsTxtState'] : '',
					'last_crawl'       => isset( $r['lastCrawlTime'] ) ? $r['lastCrawlTime'] : '',
					'google_canonical' => isset( $r['googleCanonical'] ) ? $r['googleCanonical'] : '',
					'user_canonical'   => isset( $r['userCanonical'] ) ? $r['userCanonical'] : '',
					'link'             => isset( $data['inspectionResult']['inspectionResultLink'] ) ? $data['inspectionResult']['inspectionResultLink'] : '',
				);
			}
		);
	}
}
