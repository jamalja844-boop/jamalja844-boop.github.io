<?php
/**
 * Google Ads API — uitsluitend alleen-lezen rapportages via GoogleAdsService.Search.
 *
 * Toegang (sinds 9 september 2026): het toegangsniveau hoort bij het Google
 * Cloud-project van de OAuth-client (Test → alleen testaccounts; Explorer of
 * hoger → productieaccounts). De developer-token-header is optioneel en wordt
 * door Google genegeerd; we sturen hem alleen mee als hij is ingevuld.
 *
 * Deze klasse bevat bewust GEEN mutate-aanroepen. Campagnes, advertenties,
 * biedingen en budgetten worden nooit door de plugin gewijzigd.
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
 * Google_Ads.
 */
class Google_Ads {

	const BASE = 'https://googleads.googleapis.com/';

	/**
	 * Is de koppeling compleet?
	 *
	 * @return bool
	 */
	public static function ready() {
		return Google_OAuth::connected() && '' !== Settings::get( 'ads_customer_id' );
	}

	/**
	 * API-basis met versie.
	 *
	 * @return string
	 */
	private static function base() {
		return self::BASE . Settings::get( 'ads_api_version' ) . '/';
	}

	/**
	 * Request-headers.
	 *
	 * @return array|WP_Error
	 */
	private static function headers() {
		$token = Google_OAuth::access_token();
		if ( is_wp_error( $token ) ) {
			return $token;
		}
		$headers = array( 'Authorization' => 'Bearer ' . $token );
		$dev     = Settings::secret( 'ads_developer_token' );
		if ( '' !== $dev ) {
			$headers['developer-token'] = $dev;
		}
		$login = Settings::get( 'ads_login_customer_id' );
		if ( '' !== $login ) {
			$headers['login-customer-id'] = $login;
		}
		return $headers;
	}

	/**
	 * Telt een API-operatie tegen de ingestelde daglimiet.
	 *
	 * @return true|WP_Error
	 */
	private static function quota() {
		if ( ! Rate_Limiter::hit( 'google_ads_ops', (int) Settings::get( 'ads_daily_op_limit' ), DAY_IN_SECONDS ) ) {
			return new WP_Error( 'csaam_ads_quota', __( 'De ingestelde daglimiet voor Google Ads API-verzoeken is bereikt. Gegevens worden morgen weer ververst (Explorer-toegang: max. 2.880 operaties per dag op productieaccounts).', 'clean-seo-ads-ai' ) );
		}
		return true;
	}

	/**
	 * Toegankelijke klant-ID's.
	 *
	 * @return array|WP_Error
	 */
	public static function accessible_customers() {
		$headers = self::headers();
		if ( is_wp_error( $headers ) ) {
			return $headers;
		}
		unset( $headers['login-customer-id'] );
		$quota = self::quota();
		if ( is_wp_error( $quota ) ) {
			return $quota;
		}
		$data = Http::json( 'GET', self::base() . 'customers:listAccessibleCustomers', array( 'headers' => $headers ), 'google_ads' );
		if ( is_wp_error( $data ) ) {
			return self::explain( $data );
		}
		$ids = array();
		foreach ( isset( $data['resourceNames'] ) ? $data['resourceNames'] : array() as $name ) {
			$ids[] = preg_replace( '/\D/', '', $name );
		}
		return $ids;
	}

	/**
	 * Voert een GAQL-query uit (alleen-lezen). Max. 5 pagina's.
	 *
	 * @param string $query GAQL.
	 * @return array|WP_Error Rijen.
	 */
	public static function search( $query ) {
		if ( ! preg_match( '/^\s*SELECT\b/i', $query ) ) {
			return new WP_Error( 'csaam_ads_readonly', __( 'Alleen-lezen: alleen SELECT-queries zijn toegestaan.', 'clean-seo-ads-ai' ) );
		}
		$headers = self::headers();
		if ( is_wp_error( $headers ) ) {
			return $headers;
		}
		$customer = Settings::get( 'ads_customer_id' );
		$url      = self::base() . 'customers/' . rawurlencode( $customer ) . '/googleAds:search';
		$rows     = array();
		$page     = '';
		for ( $i = 0; $i < 5; $i++ ) {
			$quota = self::quota();
			if ( is_wp_error( $quota ) ) {
				return $quota;
			}
			$body = array( 'query' => $query );
			if ( $page ) {
				$body['pageToken'] = $page;
			}
			$data = Http::json(
				'POST',
				$url,
				array(
					'headers' => $headers,
					'body'    => $body,
					'timeout' => 45,
				),
				'google_ads'
			);
			if ( is_wp_error( $data ) ) {
				return self::explain( $data );
			}
			$rows = array_merge( $rows, isset( $data['results'] ) ? $data['results'] : array() );
			$page = isset( $data['nextPageToken'] ) ? $data['nextPageToken'] : '';
			if ( ! $page ) {
				break;
			}
		}
		return $rows;
	}

	/**
	 * Voegt uitleg toe bij bekende toegangsfouten.
	 *
	 * @param WP_Error $error Fout.
	 * @return WP_Error
	 */
	private static function explain( WP_Error $error ) {
		$msg = $error->get_error_message();
		if ( false !== stripos( $msg, 'NOT_APPROVED_FOR_PRODUCTION' ) || false !== stripos( $msg, 'only approved for use with test accounts' ) ) {
			return new WP_Error( $error->get_error_code(), $msg . ' ' . __( 'Uw Google Cloud-project heeft alleen Test-toegang. Vraag Explorer-toegang aan via Google Cloud Console → Google Ads API → Overzicht.', 'clean-seo-ads-ai' ) );
		}
		if ( false !== stripos( $msg, 'USER_PERMISSION_DENIED' ) ) {
			return new WP_Error( $error->get_error_code(), $msg . ' ' . __( 'Controleer het klant-ID en vul bij een beheerdersaccount (MCC) het login-customer-id in.', 'clean-seo-ads-ai' ) );
		}
		return $error;
	}

	/**
	 * Datumbereik (tot en met gisteren).
	 *
	 * @param int $days Dagen.
	 * @return array{0:string,1:string}
	 */
	public static function range( $days ) {
		$end   = strtotime( 'yesterday', current_time( 'timestamp' ) ); // phpcs:ignore WordPress.DateTime.CurrentTimeTimestamp.Requested
		$start = $end - ( $days - 1 ) * DAY_IN_SECONDS;
		return array( gmdate( 'Y-m-d', $start ), gmdate( 'Y-m-d', $end ) );
	}

	/**
	 * Waarde uit genest array met punt-notatie.
	 *
	 * @param array  $row     Rij.
	 * @param string $path    Pad.
	 * @param mixed  $default Standaard.
	 * @return mixed
	 */
	private static function g( $row, $path, $default = null ) {
		foreach ( explode( '.', $path ) as $key ) {
			if ( ! is_array( $row ) || ! array_key_exists( $key, $row ) ) {
				return $default;
			}
			$row = $row[ $key ];
		}
		return $row;
	}

	/**
	 * Micros naar valuta.
	 *
	 * @param mixed $micros Micros.
	 * @return float
	 */
	private static function money( $micros ) {
		return round( (float) $micros / 1000000, 2 );
	}

	/**
	 * Gemeenschappelijke metrics.
	 *
	 * @param array $row Rij.
	 * @return array
	 */
	private static function metrics( $row ) {
		$cost = self::money( self::g( $row, 'metrics.costMicros', 0 ) );
		$conv = round( (float) self::g( $row, 'metrics.conversions', 0 ), 2 );
		$clk  = (int) self::g( $row, 'metrics.clicks', 0 );
		$impr = (int) self::g( $row, 'metrics.impressions', 0 );
		return array(
			'impressions' => $impr,
			'clicks'      => $clk,
			'ctr'         => $impr ? round( $clk / $impr * 100, 2 ) : 0,
			'cpc'         => $clk ? round( $cost / $clk, 2 ) : 0,
			'cost'        => $cost,
			'conversions' => $conv,
			'cpa'         => $conv > 0 ? round( $cost / $conv, 2 ) : null,
		);
	}

	/**
	 * Volledig overzicht (gecachet).
	 *
	 * @param int  $days    Periode.
	 * @param bool $refresh Cache negeren.
	 * @return array|WP_Error
	 */
	public static function overview( $days = 30, $refresh = false ) {
		if ( Settings::demo() ) {
			return Demo_Data::ads( $days );
		}
		if ( ! self::ready() ) {
			return new WP_Error( 'csaam_not_configured', __( 'Google Ads is nog niet gekoppeld. Koppel uw Google-account en vul het Google Ads-klant-ID in bij Instellingen.', 'clean-seo-ads-ai' ) );
		}
		return Cache::remember(
			'google',
			'ads_overview_' . $days . '_' . Settings::get( 'ads_customer_id' ),
			static function () use ( $days ) {
				return self::fetch_overview( $days );
			},
			$refresh
		);
	}

	/**
	 * Haalt alle rapporten op.
	 *
	 * @param int $days Periode.
	 * @return array|WP_Error
	 */
	private static function fetch_overview( $days ) {
		list( $from, $to ) = self::range( $days );
		$during            = "segments.date BETWEEN '{$from}' AND '{$to}'";

		$customer = self::search( 'SELECT customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1' );
		if ( is_wp_error( $customer ) ) {
			return $customer;
		}

		$campaign_rows = self::search(
			"SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE {$during} AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC"
		);
		if ( is_wp_error( $campaign_rows ) ) {
			return $campaign_rows;
		}
		$campaigns = array();
		foreach ( $campaign_rows as $row ) {
			$campaigns[] = array_merge(
				array(
					'id'      => (string) self::g( $row, 'campaign.id' ),
					'name'    => (string) self::g( $row, 'campaign.name' ),
					'status'  => (string) self::g( $row, 'campaign.status' ),
					'channel' => (string) self::g( $row, 'campaign.advertisingChannelType' ),
					'bidding' => (string) self::g( $row, 'campaign.biddingStrategyType' ),
					'budget'  => self::money( self::g( $row, 'campaignBudget.amountMicros', 0 ) ),
				),
				self::metrics( $row )
			);
		}

		$keyword_rows = self::search(
			"SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE {$during} AND ad_group_criterion.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 200"
		);
		$keywords     = array();
		if ( ! is_wp_error( $keyword_rows ) ) {
			foreach ( $keyword_rows as $row ) {
				$keywords[] = array_merge(
					array(
						'keyword'  => (string) self::g( $row, 'adGroupCriterion.keyword.text' ),
						'match'    => (string) self::g( $row, 'adGroupCriterion.keyword.matchType' ),
						'status'   => (string) self::g( $row, 'adGroupCriterion.status' ),
						'quality'  => self::g( $row, 'adGroupCriterion.qualityInfo.qualityScore' ),
						'campaign' => (string) self::g( $row, 'campaign.name' ),
						'ad_group' => (string) self::g( $row, 'adGroup.name' ),
					),
					self::metrics( $row )
				);
			}
		}

		$term_rows = self::search(
			"SELECT search_term_view.search_term, search_term_view.status, campaign.name, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE {$during} ORDER BY metrics.impressions DESC LIMIT 200"
		);
		$terms     = array();
		if ( ! is_wp_error( $term_rows ) ) {
			foreach ( $term_rows as $row ) {
				$terms[] = array_merge(
					array(
						'term'     => (string) self::g( $row, 'searchTermView.searchTerm' ),
						'status'   => (string) self::g( $row, 'searchTermView.status' ),
						'campaign' => (string) self::g( $row, 'campaign.name' ),
					),
					self::metrics( $row )
				);
			}
		}

		$ad_rows = self::search(
			"SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad_strength, ad_group_ad.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_ad WHERE {$during} AND ad_group_ad.status != 'REMOVED' ORDER BY metrics.impressions DESC LIMIT 100"
		);
		$ads     = array();
		if ( ! is_wp_error( $ad_rows ) ) {
			foreach ( $ad_rows as $row ) {
				$ads[] = array_merge(
					array(
						'id'           => (string) self::g( $row, 'adGroupAd.ad.id' ),
						'type'         => (string) self::g( $row, 'adGroupAd.ad.type' ),
						'campaign'     => (string) self::g( $row, 'campaign.name' ),
						'ad_group'     => (string) self::g( $row, 'adGroup.name' ),
						'strength'     => (string) self::g( $row, 'adGroupAd.adStrength' ),
						'final_url'    => (string) self::g( $row, 'adGroupAd.ad.finalUrls.0', '' ),
						'headlines'    => wp_list_pluck( (array) self::g( $row, 'adGroupAd.ad.responsiveSearchAd.headlines', array() ), 'text' ),
						'descriptions' => wp_list_pluck( (array) self::g( $row, 'adGroupAd.ad.responsiveSearchAd.descriptions', array() ), 'text' ),
					),
					self::metrics( $row )
				);
			}
		}

		$daily_rows = self::search( "SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM customer WHERE {$during}" );
		$daily      = array();
		if ( ! is_wp_error( $daily_rows ) ) {
			foreach ( $daily_rows as $row ) {
				$daily[] = array_merge( array( 'date' => (string) self::g( $row, 'segments.date' ) ), self::metrics( $row ) );
			}
			usort(
				$daily,
				static function ( $a, $b ) {
					return strcmp( $a['date'], $b['date'] );
				}
			);
		}

		$totals        = array(
			'impressions' => array_sum( wp_list_pluck( $campaigns, 'impressions' ) ),
			'clicks'      => array_sum( wp_list_pluck( $campaigns, 'clicks' ) ),
			'cost'        => round( array_sum( wp_list_pluck( $campaigns, 'cost' ) ), 2 ),
			'conversions' => round( array_sum( wp_list_pluck( $campaigns, 'conversions' ) ), 2 ),
		);
		$totals['cpa'] = $totals['conversions'] > 0 ? round( $totals['cost'] / $totals['conversions'], 2 ) : null;
		$totals['ctr'] = $totals['impressions'] ? round( $totals['clicks'] / $totals['impressions'] * 100, 2 ) : 0;

		return array(
			'demo'      => false,
			'account'   => array(
				'name'     => (string) self::g( $customer, '0.customer.descriptiveName', '' ),
				'currency' => (string) self::g( $customer, '0.customer.currencyCode', 'EUR' ),
			),
			'period'    => array( $from, $to ),
			'totals'    => $totals,
			'campaigns' => $campaigns,
			'keywords'  => $keywords,
			'terms'     => $terms,
			'ads'       => $ads,
			'daily'     => $daily,
			'fetched'   => time(),
		);
	}
}
