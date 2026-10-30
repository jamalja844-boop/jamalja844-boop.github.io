<?php
/**
 * REST API-routes. Alle routes vereisen de capability csaam_manage en een
 * geldige wp_rest-nonce, behalve het publieke, rate-limited event-endpoint.
 *
 * @package CSAAM
 */

namespace CSAAM;

use CSAAM\Integrations\Analytics;
use CSAAM\Integrations\Google_Ads;
use CSAAM\Integrations\PageSpeed;
use CSAAM\Integrations\Search_Console;
use CSAAM\Modules\AI_Optimizer;
use CSAAM\Modules\Conversions;
use CSAAM\Modules\Seo_Audit;
use WP_Error;
use WP_REST_Request;
use WP_REST_Server;

defined( 'ABSPATH' ) || exit;

/**
 * Rest.
 */
class Rest {

	const NS = 'csaam/v1';

	/**
	 * Registreert de routes.
	 */
	public static function register() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	/**
	 * Rechtencontrole.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return current_user_can( CSAAM_CAP );
	}

	/**
	 * Routes.
	 */
	public static function routes() {
		$admin = array( __CLASS__, 'can_manage' );
		$int   = array(
			'validate_callback' => static function ( $v ) {
				return is_numeric( $v );
			},
			'sanitize_callback' => 'absint',
		);

		register_rest_route(
			self::NS,
			'/audit/scan',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'permission_callback' => $admin,
				'args'                => array(
					'offset' => $int + array( 'default' => 0 ),
					'limit'  => $int + array( 'default' => 5 ),
				),
				'callback'            => static function ( WP_REST_Request $r ) {
					return Seo_Audit::scan_batch( (int) $r['offset'], (int) $r['limit'] );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/audit/page/(?P<id>\d+)',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'permission_callback' => $admin,
				'callback'            => static function ( WP_REST_Request $r ) {
					return self::out( Seo_Audit::scan_post( (int) $r['id'] ) );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/pagespeed',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'permission_callback' => $admin,
				'args'                => array(
					'post_id'  => $int + array( 'default' => 0 ),
					'strategy' => array(
						'default' => 'mobile',
						'enum'    => array( 'mobile', 'desktop' ),
					),
					'refresh'  => array(
						'default'           => false,
						'sanitize_callback' => 'rest_sanitize_boolean',
					),
				),
				'callback'            => static function ( WP_REST_Request $r ) {
					$post_id = (int) $r['post_id'];
					$url     = $post_id ? get_permalink( $post_id ) : home_url( '/' );
					if ( ! $url ) {
						return new WP_Error( 'csaam_not_found', __( 'Pagina niet gevonden.', 'clean-seo-ads-ai' ), array( 'status' => 404 ) );
					}
					$result = PageSpeed::run( $url, $r['strategy'], (bool) $r['refresh'] );
					if ( ! is_wp_error( $result ) && $post_id ) {
						self::store_pagespeed( $post_id, $result );
					}
					return self::out( $result );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/gsc/inspect',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'permission_callback' => $admin,
				'args'                => array( 'post_id' => $int ),
				'callback'            => static function ( WP_REST_Request $r ) {
					$url = get_permalink( (int) $r['post_id'] );
					return $url ? self::out( Search_Console::inspect( $url ) ) : new WP_Error( 'csaam_not_found', __( 'Pagina niet gevonden.', 'clean-seo-ads-ai' ), array( 'status' => 404 ) );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/ai/generate',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'permission_callback' => $admin,
				'args'                => array(
					'task'    => array(
						'required' => true,
						'enum'     => array_keys( AI_Optimizer::tasks() ),
					),
					'post_id' => $int + array( 'default' => 0 ),
				),
				'callback'            => static function ( WP_REST_Request $r ) {
					$post_id = (int) $r['post_id'];
					if ( $post_id && ! current_user_can( 'edit_post', $post_id ) ) {
						return new WP_Error( 'csaam_forbidden', __( 'U mag deze pagina niet bewerken.', 'clean-seo-ads-ai' ), array( 'status' => 403 ) );
					}
					return self::out( AI_Optimizer::generate( $r['task'], $post_id ) );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/ai/proposals/(?P<id>\d+)',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'permission_callback' => $admin,
				'callback'            => static function ( WP_REST_Request $r ) {
					return self::out( AI_Optimizer::get( (int) $r['id'] ) );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/ai/proposals/(?P<id>\d+)/decide',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'permission_callback' => $admin,
				'args'                => array(
					'decision' => array(
						'required' => true,
						'enum'     => array( 'approve', 'reject' ),
					),
					'value'    => array(
						'default'           => '',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
				'callback'            => static function ( WP_REST_Request $r ) {
					return self::out( AI_Optimizer::decide( (int) $r['id'], $r['decision'], (string) $r['value'] ) );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/ai/diff',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'permission_callback' => $admin,
				'args'                => array(
					'id'    => $int,
					'value' => array(
						'default'           => '',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
				'callback'            => static function ( WP_REST_Request $r ) {
					$item = AI_Optimizer::get( (int) $r['id'] );
					if ( is_wp_error( $item ) ) {
						return $item;
					}
					return array( 'diff' => AI_Optimizer::diff( $item['original'], (string) $r['value'] ) );
				},
			)
		);

		register_rest_route(
			self::NS,
			'/google/options',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'permission_callback' => $admin,
				'callback'            => static function () {
					$sites = Search_Console::sites();
					$props = Analytics::properties();
					$ads   = Google_Ads::accessible_customers();
					return array(
						'sites'      => is_wp_error( $sites ) ? array() : $sites,
						'sites_err'  => is_wp_error( $sites ) ? $sites->get_error_message() : '',
						'properties' => is_wp_error( $props ) ? (object) array() : $props,
						'props_err'  => is_wp_error( $props ) ? $props->get_error_message() : '',
						'customers'  => is_wp_error( $ads ) ? array() : $ads,
						'ads_err'    => is_wp_error( $ads ) ? $ads->get_error_message() : '',
					);
				},
			)
		);

		register_rest_route(
			self::NS,
			'/event',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'permission_callback' => '__return_true', // Publiek: anonieme kliktelling, zie Conversions::rest_event().
				'args'                => array(
					'type'  => array(
						'required'          => true,
						'sanitize_callback' => 'sanitize_key',
					),
					'label' => array(
						'default'           => '',
						'sanitize_callback' => 'sanitize_text_field',
					),
					'path'  => array(
						'default'           => '/',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
				'callback'            => array( Conversions::class, 'rest_event' ),
			)
		);
	}

	/**
	 * Bewaart een PageSpeed-resultaat bij de auditrij.
	 *
	 * @param int   $post_id Bericht-ID.
	 * @param array $result  Resultaat.
	 */
	private static function store_pagespeed( $post_id, array $result ) {
		global $wpdb;
		$row = Seo_Audit::get_row( $post_id );
		if ( ! $row ) {
			return;
		}
		$data                                     = $row['data'];
		$data['pagespeed'][ $result['strategy'] ] = array(
			'scores'  => $result['scores'],
			'metrics' => $result['metrics'],
			'fetched' => $result['fetched'],
		);
		$wpdb->update( Installer::table( 'audit' ), array( 'data' => wp_json_encode( $data ) ), array( 'post_id' => $post_id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	}

	/**
	 * Zet WP_Error om naar een REST-fout met status.
	 *
	 * @param mixed $result Resultaat.
	 * @return mixed
	 */
	private static function out( $result ) {
		if ( is_wp_error( $result ) ) {
			$data = $result->get_error_data();
			if ( ! is_array( $data ) || ! isset( $data['status'] ) ) {
				$result->add_data( array( 'status' => 400 ) );
			}
		}
		return $result;
	}
}
