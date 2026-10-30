<?php
/**
 * Google Analytics 4 Data API (alleen-lezen). De plugin plaatst zelf geen
 * GA4-tag, zodat er nooit dubbel gemeten wordt naast Site Kit of GTM.
 *
 * @package CSAAM
 */

namespace CSAAM\Integrations;

use CSAAM\Cache;
use CSAAM\Demo_Data;
use CSAAM\Http;
use CSAAM\Settings;
use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Analytics.
 */
class Analytics {

	const DATA  = 'https://analyticsdata.googleapis.com/v1beta/';
	const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta/';

	/**
	 * Klaar voor gebruik?
	 *
	 * @return bool
	 */
	public static function ready() {
		return Google_OAuth::connected() && '' !== Settings::get( 'ga4_property_id' );
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
		$args = array( 'headers' => array( 'Authorization' => 'Bearer ' . $token ) );
		if ( null !== $body ) {
			$args['body'] = $body;
		}
		return Http::json( $method, $url, $args, 'analytics' );
	}

	/**
	 * Beschikbare GA4-properties.
	 *
	 * @return array|WP_Error id => naam.
	 */
	public static function properties() {
		$data = self::call( 'GET', self::ADMIN . 'accountSummaries?pageSize=200' );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$out = array();
		foreach ( isset( $data['accountSummaries'] ) ? $data['accountSummaries'] : array() as $account ) {
			foreach ( isset( $account['propertySummaries'] ) ? $account['propertySummaries'] : array() as $p ) {
				$id         = preg_replace( '/\D/', '', $p['property'] );
				$out[ $id ] = $account['displayName'] . ' › ' . $p['displayName'];
			}
		}
		return $out;
	}

	/**
	 * runReport.
	 *
	 * @param int   $days       Periode.
	 * @param array $dimensions Dimensies.
	 * @param array $metrics    Metrics.
	 * @param int   $limit      Limiet.
	 * @param int   $offset     Dagen verschuiving (vorige periode).
	 * @return array|WP_Error Rijen als assoc arrays.
	 */
	public static function report( $days, array $dimensions, array $metrics, $limit = 50, $offset = 0 ) {
		$body = array(
			'dateRanges' => array(
				array(
					'startDate' => ( $days + $offset ) . 'daysAgo',
					'endDate'   => 0 === $offset ? 'yesterday' : ( $offset + 1 ) . 'daysAgo',
				),
			),
			'dimensions' => array_map(
				static function ( $d ) {
					return array( 'name' => $d );
				},
				$dimensions
			),
			'metrics'    => array_map(
				static function ( $m ) {
					return array( 'name' => $m );
				},
				$metrics
			),
			'limit'      => $limit,
		);
		if ( $metrics ) {
			$body['orderBys'] = array(
				array(
					'metric' => array( 'metricName' => $metrics[0] ),
					'desc'   => true,
				),
			);
		}
		if ( array( 'date' ) === $dimensions ) {
			$body['orderBys'] = array( array( 'dimension' => array( 'dimensionName' => 'date' ) ) );
		}
		$data = self::call( 'POST', self::DATA . 'properties/' . rawurlencode( Settings::get( 'ga4_property_id' ) ) . ':runReport', $body );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$rows = array();
		foreach ( isset( $data['rows'] ) ? $data['rows'] : array() as $row ) {
			$item = array();
			foreach ( $dimensions as $i => $d ) {
				$item[ $d ] = $row['dimensionValues'][ $i ]['value'];
			}
			foreach ( $metrics as $i => $m ) {
				$item[ $m ] = round( (float) $row['metricValues'][ $i ]['value'], 4 );
			}
			$rows[] = $item;
		}
		return $rows;
	}

	/**
	 * Overzicht.
	 *
	 * @param int  $days    Periode.
	 * @param bool $refresh Cache negeren.
	 * @return array|WP_Error
	 */
	public static function overview( $days = 28, $refresh = false ) {
		if ( Settings::demo() ) {
			return Demo_Data::ga4( $days );
		}
		if ( ! self::ready() ) {
			return new WP_Error( 'csaam_not_configured', __( 'Google Analytics 4 is nog niet gekoppeld. Koppel uw Google-account en kies de GA4-property bij Instellingen.', 'clean-seo-ads-ai' ) );
		}
		return Cache::remember(
			'google',
			'ga4_overview_' . $days . '_' . Settings::get( 'ga4_property_id' ),
			static function () use ( $days ) {
				$core  = array( 'sessions', 'totalUsers', 'engagedSessions', 'keyEvents' );
				$daily = self::report( $days, array( 'date' ), $core, 400 );
				if ( is_wp_error( $daily ) ) {
					return $daily;
				}
				$prev     = self::report( $days, array(), $core, 1, $days );
				$totals   = self::report( $days, array(), array_merge( $core, array( 'engagementRate', 'averageSessionDuration' ) ), 1 );
				$channels = self::report( $days, array( 'sessionDefaultChannelGroup' ), array( 'sessions', 'engagedSessions', 'keyEvents' ), 20 );
				$landing  = self::report( $days, array( 'landingPage' ), array( 'sessions', 'engagementRate', 'keyEvents' ), 50 );
				$events   = self::report( $days, array( 'eventName' ), array( 'keyEvents', 'eventCount' ), 30 );
				$devices  = self::report( $days, array( 'deviceCategory' ), array( 'sessions', 'keyEvents' ), 5 );

				foreach ( $daily as &$d ) {
					$d['date'] = substr( $d['date'], 0, 4 ) . '-' . substr( $d['date'], 4, 2 ) . '-' . substr( $d['date'], 6, 2 );
				}
				unset( $d );

				return array(
					'demo'     => false,
					'totals'   => is_wp_error( $totals ) || ! $totals ? array() : $totals[0],
					'previous' => is_wp_error( $prev ) || ! $prev ? null : $prev[0],
					'daily'    => $daily,
					'channels' => is_wp_error( $channels ) ? array() : $channels,
					'landing'  => is_wp_error( $landing ) ? array() : $landing,
					'events'   => is_wp_error( $events ) ? array() : array_values(
						array_filter(
							$events,
							static function ( $e ) {
								return $e['keyEvents'] > 0;
							}
						)
					),
					'devices'  => is_wp_error( $devices ) ? array() : $devices,
					'fetched'  => time(),
				);
			},
			$refresh
		);
	}
}
