<?php
/**
 * Voorbeeldgegevens — uitsluitend gebruikt in de duidelijk gemarkeerde
 * demomodus. Alle structuren bevatten 'demo' => true.
 *
 * @package CSAAM
 */

namespace CSAAM;

defined( 'ABSPATH' ) || exit;

/**
 * Demo_Data.
 */
class Demo_Data {

	/**
	 * Reproduceerbare pseudo-random reeks.
	 *
	 * @param string $seed Seed.
	 * @param int    $min  Min.
	 * @param int    $max  Max.
	 * @return int
	 */
	private static function rnd( $seed, $min, $max ) {
		return $min + ( abs( crc32( $seed ) ) % ( $max - $min + 1 ) );
	}

	/**
	 * Datumreeks.
	 *
	 * @param int $days Dagen.
	 * @param int $lag  Achterstand.
	 * @return string[]
	 */
	private static function dates( $days, $lag = 1 ) {
		$out = array();
		$end = current_time( 'timestamp' ) - $lag * DAY_IN_SECONDS; // phpcs:ignore WordPress.DateTime.CurrentTimeTimestamp.Requested
		for ( $i = $days - 1; $i >= 0; $i-- ) {
			$out[] = gmdate( 'Y-m-d', $end - $i * DAY_IN_SECONDS );
		}
		return $out;
	}

	/**
	 * Google Ads-demo.
	 *
	 * @param int $days Dagen.
	 * @return array
	 */
	public static function ads( $days ) {
		$campaigns = array();
		$names     = array( 'Zoeken – Kantoorschoonmaak Utrecht e.o.', 'Zoeken – Glasbewassing Zeist', 'Zoeken – VvE-schoonmaak', 'Zoeken – Merk' );
		foreach ( $names as $i => $name ) {
			$impr        = self::rnd( $name . 'i', 800, 6000 ) * $days / 30;
			$clicks      = (int) ( $impr * self::rnd( $name . 'c', 3, 9 ) / 100 );
			$cost        = round( $clicks * self::rnd( $name . 'p', 120, 380 ) / 100, 2 );
			$conv        = round( $clicks * self::rnd( $name . 'v', 4, 12 ) / 100, 1 );
			$campaigns[] = array(
				'id'          => (string) ( 1000 + $i ),
				'name'        => $name,
				'status'      => 'ENABLED',
				'channel'     => 'SEARCH',
				'bidding'     => 3 === $i ? 'TARGET_IMPRESSION_SHARE' : 'MAXIMIZE_CONVERSIONS',
				'budget'      => (float) self::rnd( $name . 'b', 10, 40 ),
				'impressions' => (int) $impr,
				'clicks'      => $clicks,
				'ctr'         => $impr ? round( $clicks / $impr * 100, 2 ) : 0,
				'cpc'         => $clicks ? round( $cost / $clicks, 2 ) : 0,
				'cost'        => $cost,
				'conversions' => $conv,
				'cpa'         => $conv > 0 ? round( $cost / $conv, 2 ) : null,
			);
		}
		$keywords = array();
		foreach ( array( 'kantoorschoonmaak utrecht', 'schoonmaakbedrijf zeist', 'glazenwasser zeist', 'vve schoonmaak', 'schoonmaakbedrijf kantoor', 'bedrijfsschoonmaak amersfoort', 'schoonmaak vacatures' ) as $k ) {
			$impr       = self::rnd( $k, 100, 1500 );
			$clk        = (int) ( $impr * self::rnd( $k . 'c', 2, 10 ) / 100 );
			$cost       = round( $clk * self::rnd( $k . 'p', 100, 400 ) / 100, 2 );
			$conv       = 'schoonmaak vacatures' === $k ? 0 : round( $clk * self::rnd( $k . 'v', 3, 14 ) / 100, 1 );
			$keywords[] = array(
				'keyword'     => $k,
				'match'       => self::rnd( $k . 'm', 0, 1 ) ? 'PHRASE' : 'EXACT',
				'status'      => 'ENABLED',
				'quality'     => self::rnd( $k . 'q', 3, 9 ),
				'campaign'    => $names[0],
				'ad_group'    => 'Algemeen',
				'impressions' => $impr,
				'clicks'      => $clk,
				'ctr'         => round( $clk / max( 1, $impr ) * 100, 2 ),
				'cpc'         => $clk ? round( $cost / $clk, 2 ) : 0,
				'cost'        => $cost,
				'conversions' => $conv,
				'cpa'         => $conv > 0 ? round( $cost / $conv, 2 ) : null,
			);
		}
		$terms = array();
		foreach ( array( 'schoonmaakbedrijf zeist offerte', 'kantoor schoonmaken prijs per uur', 'schoonmaakster particulier', 'glazenwasser bilthoven', 'vacature schoonmaker utrecht' ) as $t ) {
			$impr    = self::rnd( $t, 20, 400 );
			$clk     = (int) ( $impr * self::rnd( $t . 'c', 2, 12 ) / 100 );
			$cost    = round( $clk * 2.1, 2 );
			$conv    = false !== strpos( $t, 'vacature' ) || false !== strpos( $t, 'particulier' ) ? 0 : round( $clk * 0.1, 1 );
			$terms[] = array(
				'term'        => $t,
				'status'      => 'NONE',
				'campaign'    => $names[0],
				'impressions' => $impr,
				'clicks'      => $clk,
				'ctr'         => round( $clk / max( 1, $impr ) * 100, 2 ),
				'cpc'         => 2.1,
				'cost'        => $cost,
				'conversions' => $conv,
				'cpa'         => $conv > 0 ? round( $cost / $conv, 2 ) : null,
			);
		}
		$ads   = array(
			array(
				'id'           => '1',
				'type'         => 'RESPONSIVE_SEARCH_AD',
				'campaign'     => $names[0],
				'ad_group'     => 'Algemeen',
				'strength'     => 'AVERAGE',
				'final_url'    => home_url( '/kantoorschoonmaak/' ),
				'headlines'    => array( 'Kantoorschoonmaak Utrecht', 'Schoon Kantoor, Blije Collega\'s', 'Vraag Direct Een Offerte Aan' ),
				'descriptions' => array( 'Professionele kantoorschoonmaak in Utrecht en omgeving. Vrijblijvende offerte.' ),
				'impressions'  => 3200,
				'clicks'       => 190,
				'ctr'          => 5.94,
				'cpc'          => 2.35,
				'cost'         => 446.5,
				'conversions'  => 14,
				'cpa'          => 31.89,
			),
		);
		$daily = array();
		foreach ( self::dates( $days ) as $date ) {
			$clk     = self::rnd( $date . 'ac', 8, 30 );
			$cost    = round( $clk * self::rnd( $date . 'ap', 180, 300 ) / 100, 2 );
			$conv    = self::rnd( $date . 'av', 0, 3 );
			$daily[] = array(
				'date'        => $date,
				'impressions' => $clk * 18,
				'clicks'      => $clk,
				'ctr'         => 5.5,
				'cpc'         => round( $cost / $clk, 2 ),
				'cost'        => $cost,
				'conversions' => $conv,
				'cpa'         => $conv ? round( $cost / $conv, 2 ) : null,
			);
		}
		$totals        = array(
			'impressions' => array_sum( wp_list_pluck( $campaigns, 'impressions' ) ),
			'clicks'      => array_sum( wp_list_pluck( $campaigns, 'clicks' ) ),
			'cost'        => round( array_sum( wp_list_pluck( $campaigns, 'cost' ) ), 2 ),
			'conversions' => round( array_sum( wp_list_pluck( $campaigns, 'conversions' ) ), 1 ),
		);
		$totals['cpa'] = $totals['conversions'] ? round( $totals['cost'] / $totals['conversions'], 2 ) : null;
		$totals['ctr'] = round( $totals['clicks'] / max( 1, $totals['impressions'] ) * 100, 2 );
		$dates         = self::dates( $days );
		return array(
			'demo'      => true,
			'account'   => array(
				'name'     => 'DEMO-account',
				'currency' => 'EUR',
			),
			'period'    => array( reset( $dates ), end( $dates ) ),
			'totals'    => $totals,
			'campaigns' => $campaigns,
			'keywords'  => $keywords,
			'terms'     => $terms,
			'ads'       => $ads,
			'daily'     => $daily,
			'fetched'   => time(),
		);
	}

	/**
	 * Search Console-demo.
	 *
	 * @param int $days Dagen.
	 * @return array
	 */
	public static function gsc( $days ) {
		$daily = array();
		foreach ( self::dates( $days, 3 ) as $date ) {
			$daily[] = array(
				'date'        => $date,
				'clicks'      => self::rnd( $date . 'gc', 10, 45 ),
				'impressions' => self::rnd( $date . 'gi', 400, 1400 ),
				'position'    => self::rnd( $date . 'gp', 90, 160 ) / 10,
			);
		}
		$queries = array();
		$cities  = Settings::get( 'cities' );
		$svc     = Settings::get( 'services' );
		foreach ( array_slice( $svc, 0, 5 ) as $s ) {
			foreach ( array_slice( $cities, 0, 4 ) as $c ) {
				$q         = mb_strtolower( $s . ' ' . $c );
				$impr      = self::rnd( $q, 20, 900 );
				$pos       = self::rnd( $q . 'p', 30, 280 ) / 10;
				$ctr       = $pos < 4 ? 12 : ( $pos < 10 ? 4 : 0.8 );
				$queries[] = array(
					'keys'        => array( $q ),
					'clicks'      => (int) round( $impr * $ctr / 100 ),
					'impressions' => $impr,
					'ctr'         => $ctr,
					'position'    => $pos,
				);
			}
		}
		usort(
			$queries,
			static function ( $a, $b ) {
				return $b['impressions'] - $a['impressions'];
			}
		);
		$pages = array();
		foreach ( get_posts(
			array(
				'post_type'   => 'page',
				'numberposts' => 10,
				'fields'      => 'ids',
			)
		) as $id ) {
			$url     = get_permalink( $id );
			$impr    = self::rnd( $url, 100, 4000 );
			$pages[] = array(
				'keys'        => array( $url ),
				'clicks'      => (int) ( $impr * 0.03 ),
				'impressions' => $impr,
				'ctr'         => 3.0,
				'position'    => self::rnd( $url . 'p', 40, 200 ) / 10,
			);
		}
		$pairs = array();
		foreach ( $queries as $i => $q ) {
			if ( $pages ) {
				$p       = $pages[ $i % count( $pages ) ];
				$pairs[] = array_merge( $q, array( 'keys' => array( $q['keys'][0], $p['keys'][0] ) ) );
				if ( 0 === $i % 6 && count( $pages ) > 1 ) {
					$p2      = $pages[ ( $i + 1 ) % count( $pages ) ];
					$pairs[] = array_merge( $q, array( 'keys' => array( $q['keys'][0], $p2['keys'][0] ) ) );
				}
			}
		}
		$tot             = array(
			'clicks'      => array_sum( wp_list_pluck( $daily, 'clicks' ) ),
			'impressions' => array_sum( wp_list_pluck( $daily, 'impressions' ) ),
		);
		$tot['ctr']      = round( $tot['clicks'] / max( 1, $tot['impressions'] ) * 100, 2 );
		$tot['position'] = 12.4;
		$prev            = array(
			'clicks'      => (int) ( $tot['clicks'] * 0.88 ),
			'impressions' => (int) ( $tot['impressions'] * 0.93 ),
			'ctr'         => round( $tot['ctr'] * 0.95, 2 ),
			'position'    => 13.1,
		);
		$dates           = self::dates( $days, 3 );
		return array(
			'demo'     => true,
			'period'   => array( reset( $dates ), end( $dates ) ),
			'totals'   => $tot,
			'previous' => $prev,
			'daily'    => $daily,
			'queries'  => $queries,
			'pages'    => $pages,
			'pairs'    => $pairs,
			'devices'  => array(
				array(
					'keys'        => array( 'MOBILE' ),
					'clicks'      => (int) ( $tot['clicks'] * 0.62 ),
					'impressions' => (int) ( $tot['impressions'] * 0.58 ),
					'ctr'         => 3.1,
					'position'    => 12.9,
				),
				array(
					'keys'        => array( 'DESKTOP' ),
					'clicks'      => (int) ( $tot['clicks'] * 0.38 ),
					'impressions' => (int) ( $tot['impressions'] * 0.42 ),
					'ctr'         => 2.7,
					'position'    => 11.6,
				),
			),
			'fetched'  => time(),
		);
	}

	/**
	 * Sitemaps-demo.
	 *
	 * @return array
	 */
	public static function gsc_sitemaps() {
		return array(
			array(
				'path'      => home_url( '/sitemap_index.xml' ),
				'submitted' => gmdate( 'c', time() - 20 * DAY_IN_SECONDS ),
				'errors'    => 0,
				'warnings'  => 0,
				'pending'   => false,
				'demo'      => true,
			),
		);
	}

	/**
	 * URL-inspectie-demo.
	 *
	 * @param string $url URL.
	 * @return array
	 */
	public static function inspection( $url ) {
		return array(
			'demo'             => true,
			'verdict'          => 'PASS',
			'coverage'         => 'Ingediend en geïndexeerd (DEMO)',
			'indexing'         => 'INDEXING_ALLOWED',
			'robots'           => 'ALLOWED',
			'last_crawl'       => gmdate( 'c', time() - 5 * DAY_IN_SECONDS ),
			'google_canonical' => $url,
			'user_canonical'   => $url,
			'link'             => '',
		);
	}

	/**
	 * GA4-demo.
	 *
	 * @param int $days Dagen.
	 * @return array
	 */
	public static function ga4( $days ) {
		$daily = array();
		foreach ( self::dates( $days ) as $date ) {
			$s       = self::rnd( $date . 's', 40, 140 );
			$daily[] = array(
				'date'            => $date,
				'sessions'        => $s,
				'totalUsers'      => (int) ( $s * 0.85 ),
				'engagedSessions' => (int) ( $s * 0.55 ),
				'keyEvents'       => self::rnd( $date . 'k', 0, 5 ),
			);
		}
		$tot = array(
			'sessions'               => array_sum( wp_list_pluck( $daily, 'sessions' ) ),
			'totalUsers'             => array_sum( wp_list_pluck( $daily, 'totalUsers' ) ),
			'engagedSessions'        => array_sum( wp_list_pluck( $daily, 'engagedSessions' ) ),
			'keyEvents'              => array_sum( wp_list_pluck( $daily, 'keyEvents' ) ),
			'engagementRate'         => 0.55,
			'averageSessionDuration' => 74.2,
		);
		return array(
			'demo'     => true,
			'totals'   => $tot,
			'previous' => array(
				'sessions'        => (int) ( $tot['sessions'] * 0.9 ),
				'totalUsers'      => (int) ( $tot['totalUsers'] * 0.9 ),
				'engagedSessions' => (int) ( $tot['engagedSessions'] * 0.86 ),
				'keyEvents'       => (int) ( $tot['keyEvents'] * 0.8 ),
			),
			'daily'    => $daily,
			'channels' => array(
				array(
					'sessionDefaultChannelGroup' => 'Organic Search',
					'sessions'                   => (int) ( $tot['sessions'] * 0.46 ),
					'engagedSessions'            => (int) ( $tot['sessions'] * 0.28 ),
					'keyEvents'                  => (int) ( $tot['keyEvents'] * 0.4 ),
				),
				array(
					'sessionDefaultChannelGroup' => 'Paid Search',
					'sessions'                   => (int) ( $tot['sessions'] * 0.24 ),
					'engagedSessions'            => (int) ( $tot['sessions'] * 0.12 ),
					'keyEvents'                  => (int) ( $tot['keyEvents'] * 0.35 ),
				),
				array(
					'sessionDefaultChannelGroup' => 'Direct',
					'sessions'                   => (int) ( $tot['sessions'] * 0.2 ),
					'engagedSessions'            => (int) ( $tot['sessions'] * 0.1 ),
					'keyEvents'                  => (int) ( $tot['keyEvents'] * 0.2 ),
				),
				array(
					'sessionDefaultChannelGroup' => 'Referral',
					'sessions'                   => (int) ( $tot['sessions'] * 0.1 ),
					'engagedSessions'            => (int) ( $tot['sessions'] * 0.05 ),
					'keyEvents'                  => (int) ( $tot['keyEvents'] * 0.05 ),
				),
			),
			'landing'  => array(
				array(
					'landingPage'    => '/',
					'sessions'       => (int) ( $tot['sessions'] * 0.4 ),
					'engagementRate' => 0.58,
					'keyEvents'      => (int) ( $tot['keyEvents'] * 0.4 ),
				),
				array(
					'landingPage'    => '/kantoorschoonmaak/',
					'sessions'       => (int) ( $tot['sessions'] * 0.2 ),
					'engagementRate' => 0.61,
					'keyEvents'      => (int) ( $tot['keyEvents'] * 0.3 ),
				),
				array(
					'landingPage'    => '/offerte/',
					'sessions'       => (int) ( $tot['sessions'] * 0.08 ),
					'engagementRate' => 0.72,
					'keyEvents'      => (int) ( $tot['keyEvents'] * 0.2 ),
				),
			),
			'events'   => array(
				array(
					'eventName'  => 'generate_lead',
					'keyEvents'  => (int) ( $tot['keyEvents'] * 0.6 ),
					'eventCount' => (int) ( $tot['keyEvents'] * 0.6 ),
				),
				array(
					'eventName'  => 'phone_click',
					'keyEvents'  => (int) ( $tot['keyEvents'] * 0.4 ),
					'eventCount' => (int) ( $tot['keyEvents'] * 0.4 ),
				),
			),
			'devices'  => array(
				array(
					'deviceCategory' => 'mobile',
					'sessions'       => (int) ( $tot['sessions'] * 0.6 ),
					'keyEvents'      => (int) ( $tot['keyEvents'] * 0.5 ),
				),
				array(
					'deviceCategory' => 'desktop',
					'sessions'       => (int) ( $tot['sessions'] * 0.4 ),
					'keyEvents'      => (int) ( $tot['keyEvents'] * 0.5 ),
				),
			),
			'fetched'  => time(),
		);
	}

	/**
	 * PageSpeed-demo.
	 *
	 * @param string $url      URL.
	 * @param string $strategy Strategie.
	 * @return array
	 */
	public static function pagespeed( $url, $strategy ) {
		$m = 'mobile' === $strategy;
		return array(
			'demo'          => true,
			'strategy'      => $strategy,
			'scores'        => array(
				'performance'    => $m ? self::rnd( $url . 'pm', 45, 80 ) : self::rnd( $url . 'pd', 75, 98 ),
				'seo'            => self::rnd( $url . 's', 85, 100 ),
				'accessibility'  => self::rnd( $url . 'a', 75, 98 ),
				'best_practices' => self::rnd( $url . 'b', 80, 100 ),
			),
			'metrics'       => array(
				'LCP' => $m ? '3,4 s' : '1,6 s',
				'CLS' => '0,08',
				'TBT' => $m ? '320 ms' : '60 ms',
				'FCP' => $m ? '2,1 s' : '0,8 s',
				'SI'  => $m ? '4,0 s' : '1,7 s',
			),
			'field'         => array(),
			'opportunities' => array(
				array(
					'id'      => 'uses-optimized-images',
					'title'   => 'Afbeeldingen efficiënt coderen (DEMO)',
					'savings' => '0,9 s',
				),
				array(
					'id'      => 'render-blocking-resources',
					'title'   => 'Bronnen die de weergave blokkeren elimineren (DEMO)',
					'savings' => '0,6 s',
				),
			),
			'fetched'       => time(),
		);
	}

	/**
	 * Lead-demo voor het conversiescherm.
	 *
	 * @param int $days Dagen.
	 * @return array
	 */
	public static function leads( $days ) {
		$daily = array();
		$types = array(
			'quote_form' => 0,
			'contact'    => 0,
			'phone'      => 0,
			'email'      => 0,
			'whatsapp'   => 0,
			'cta'        => 0,
		);
		foreach ( self::dates( $days, 0 ) as $date ) {
			$row = array( 'date' => $date );
			foreach ( array_keys( $types ) as $t ) {
				$row[ $t ]    = self::rnd( $date . $t, 0, 'phone' === $t ? 4 : 2 );
				$types[ $t ] += $row[ $t ];
			}
			$daily[] = $row;
		}
		return array(
			'demo'   => true,
			'totals' => $types,
			'daily'  => $daily,
			'pages'  => array(
				array(
					'page_path' => '/offerte/',
					'total'     => (int) ( $types['quote_form'] * 0.7 ),
				),
				array(
					'page_path' => '/kantoorschoonmaak/',
					'total'     => (int) ( $types['phone'] * 0.4 ),
				),
				array(
					'page_path' => '/',
					'total'     => (int) ( $types['phone'] * 0.3 ),
				),
			),
		);
	}
}
