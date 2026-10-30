<?php
/**
 * Rapportages: Google-prestaties, leads, SEO-status en AI-wijzigingen in één
 * overzicht, als CSV te downloaden of maandelijks per e-mail.
 *
 * @package CSAAM
 */

namespace CSAAM\Modules;

use CSAAM\Installer;
use CSAAM\Integrations\Analytics;
use CSAAM\Integrations\Google_Ads;
use CSAAM\Integrations\Search_Console;
use CSAAM\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Reports.
 */
class Reports {

	/**
	 * Verandering in procenten.
	 *
	 * @param float      $now  Nu.
	 * @param float|null $prev Vorige periode.
	 * @return float|null
	 */
	private static function delta( $now, $prev ) {
		if ( null === $prev || 0.0 === (float) $prev ) {
			return null;
		}
		return round( ( $now - $prev ) / $prev * 100, 1 );
	}

	/**
	 * Bouwt het rapport.
	 *
	 * @param int $days Periode.
	 * @return array
	 */
	public static function build( $days = 30 ) {
		$gsc   = Search_Console::overview( $days );
		$ga4   = Analytics::overview( $days );
		$ads   = Google_Ads::overview( $days );
		$leads = Conversions::totals( $days );
		$audit = Seo_Audit::results()['summary'];

		$sections = array();
		$demo     = Settings::demo();

		if ( ! is_wp_error( $gsc ) ) {
			$p          = $gsc['previous'];
			$sections[] = array(
				'title' => __( 'Google Zoeken (Search Console)', 'clean-seo-ads-ai' ),
				'rows'  => array(
					array( __( 'Klikken', 'clean-seo-ads-ai' ), $gsc['totals']['clicks'], self::delta( $gsc['totals']['clicks'], $p ? $p['clicks'] : null ) ),
					array( __( 'Vertoningen', 'clean-seo-ads-ai' ), $gsc['totals']['impressions'], self::delta( $gsc['totals']['impressions'], $p ? $p['impressions'] : null ) ),
					array( __( 'CTR (%)', 'clean-seo-ads-ai' ), $gsc['totals']['ctr'], self::delta( $gsc['totals']['ctr'], $p ? $p['ctr'] : null ) ),
					array( __( 'Gem. positie', 'clean-seo-ads-ai' ), $gsc['totals']['position'], $p ? round( $p['position'] - $gsc['totals']['position'], 1 ) : null ),
				),
				'note'  => __( 'Bij gemiddelde positie is een positief getal een verbetering (hoger in Google).', 'clean-seo-ads-ai' ),
			);
		} else {
			$sections[] = array(
				'title' => __( 'Google Zoeken (Search Console)', 'clean-seo-ads-ai' ),
				'error' => $gsc->get_error_message(),
			);
		}

		if ( ! is_wp_error( $ga4 ) ) {
			$p          = $ga4['previous'];
			$t          = $ga4['totals'];
			$sections[] = array(
				'title' => __( 'Websitebezoek (GA4)', 'clean-seo-ads-ai' ),
				'rows'  => array(
					array( __( 'Sessies', 'clean-seo-ads-ai' ), isset( $t['sessions'] ) ? $t['sessions'] : 0, self::delta( isset( $t['sessions'] ) ? $t['sessions'] : 0, $p ? $p['sessions'] : null ) ),
					array( __( 'Gebruikers', 'clean-seo-ads-ai' ), isset( $t['totalUsers'] ) ? $t['totalUsers'] : 0, self::delta( isset( $t['totalUsers'] ) ? $t['totalUsers'] : 0, $p ? $p['totalUsers'] : null ) ),
					array( __( 'Betrokken sessies', 'clean-seo-ads-ai' ), isset( $t['engagedSessions'] ) ? $t['engagedSessions'] : 0, self::delta( isset( $t['engagedSessions'] ) ? $t['engagedSessions'] : 0, $p ? $p['engagedSessions'] : null ) ),
					array( __( 'Belangrijke gebeurtenissen', 'clean-seo-ads-ai' ), isset( $t['keyEvents'] ) ? $t['keyEvents'] : 0, self::delta( isset( $t['keyEvents'] ) ? $t['keyEvents'] : 0, $p ? $p['keyEvents'] : null ) ),
				),
			);
		} else {
			$sections[] = array(
				'title' => __( 'Websitebezoek (GA4)', 'clean-seo-ads-ai' ),
				'error' => $ga4->get_error_message(),
			);
		}

		$total_leads = $leads['quote_form'] + $leads['contact'] + $leads['phone'] + $leads['email'] + $leads['whatsapp'];
		if ( ! is_wp_error( $ads ) ) {
			$sections[] = array(
				'title' => __( 'Google Ads', 'clean-seo-ads-ai' ),
				'rows'  => array(
					array( __( 'Kosten', 'clean-seo-ads-ai' ), '€ ' . number_format_i18n( $ads['totals']['cost'], 2 ), null ),
					array( __( 'Klikken', 'clean-seo-ads-ai' ), $ads['totals']['clicks'], null ),
					array( __( 'Conversies (Google Ads)', 'clean-seo-ads-ai' ), $ads['totals']['conversions'], null ),
					array( __( 'Kosten per conversie', 'clean-seo-ads-ai' ), null === $ads['totals']['cpa'] ? '—' : '€ ' . number_format_i18n( $ads['totals']['cpa'], 2 ), null ),
				),
				'note'  => __( 'Google Ads-conversies en de eigen leadtelling kunnen verschillen (attributie, consent, meetmoment).', 'clean-seo-ads-ai' ),
			);
		} else {
			$sections[] = array(
				'title' => __( 'Google Ads', 'clean-seo-ads-ai' ),
				'error' => $ads->get_error_message(),
			);
		}

		$labels    = Conversions::labels();
		$lead_rows = array();
		foreach ( $leads as $type => $count ) {
			$lead_rows[] = array( $labels[ $type ], $count, null );
		}
		$sections[] = array(
			'title' => __( 'Leads (eigen meting)', 'clean-seo-ads-ai' ),
			'rows'  => $lead_rows,
		);

		global $wpdb;
		$table = Installer::table( 'proposals' );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$ai         = $wpdb->get_results( $wpdb->prepare( "SELECT status, COUNT(*) AS total FROM {$table} WHERE created_at >= %s GROUP BY status", gmdate( 'Y-m-d', time() - $days * DAY_IN_SECONDS ) ), ARRAY_A );
		$ai_counts  = wp_list_pluck( $ai, 'total', 'status' );
		$sections[] = array(
			'title' => __( 'SEO-status en AI-optimalisatie', 'clean-seo-ads-ai' ),
			'rows'  => array(
				array( __( 'Gemiddelde SEO-score', 'clean-seo-ads-ai' ), $audit['avg'], null ),
				array( __( 'Fouten', 'clean-seo-ads-ai' ), $audit['errors'], null ),
				array( __( 'Waarschuwingen', 'clean-seo-ads-ai' ), $audit['warnings'], null ),
				array( __( 'AI-voorstellen toegepast', 'clean-seo-ads-ai' ), isset( $ai_counts['applied'] ) ? (int) $ai_counts['applied'] : 0, null ),
				array( __( 'AI-voorstellen goedgekeurd (handmatig uit te voeren)', 'clean-seo-ads-ai' ), isset( $ai_counts['approved'] ) ? (int) $ai_counts['approved'] : 0, null ),
				array( __( 'AI-voorstellen afgewezen', 'clean-seo-ads-ai' ), isset( $ai_counts['rejected'] ) ? (int) $ai_counts['rejected'] : 0, null ),
			),
		);

		return array(
			'demo'      => $demo,
			'days'      => $days,
			'generated' => current_time( 'mysql' ),
			'company'   => Settings::get( 'company_name' ),
			'sections'  => $sections,
			'kpi'       => array(
				'leads'         => $total_leads,
				'cost_per_lead' => ! is_wp_error( $ads ) && $total_leads ? round( $ads['totals']['cost'] / $total_leads, 2 ) : null,
			),
		);
	}

	/**
	 * CSV-export (UTF-8 met BOM voor Excel, puntkomma als scheidingsteken).
	 *
	 * @param int $days Periode.
	 */
	public static function download_csv( $days ) {
		$report   = self::build( $days );
		$filename = 'rapport-' . sanitize_title( $report['company'] ) . '-' . gmdate( 'Y-m-d' ) . '.csv';
		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
		$out = fopen( 'php://output', 'w' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		fwrite( $out, "\xEF\xBB\xBF" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
		/* translators: %d: dagen */
		fputcsv( $out, array( $report['company'], sprintf( __( 'Laatste %d dagen', 'clean-seo-ads-ai' ), $days ), $report['demo'] ? 'DEMOMODUS' : '' ), ';' );
		foreach ( $report['sections'] as $section ) {
			fputcsv( $out, array(), ';' );
			fputcsv( $out, array( $section['title'] ), ';' );
			if ( isset( $section['error'] ) ) {
				fputcsv( $out, array( self::csv_safe( $section['error'] ) ), ';' );
				continue;
			}
			fputcsv( $out, array( __( 'Meting', 'clean-seo-ads-ai' ), __( 'Waarde', 'clean-seo-ads-ai' ), __( 'Verandering t.o.v. vorige periode', 'clean-seo-ads-ai' ) ), ';' );
			foreach ( $section['rows'] as $row ) {
				fputcsv( $out, array( self::csv_safe( $row[0] ), self::csv_safe( $row[1] ), null === $row[2] ? '' : $row[2] ), ';' );
			}
		}
		fclose( $out ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		exit;
	}

	/**
	 * Voorkomt formule-injectie in spreadsheets.
	 *
	 * @param mixed $value Waarde.
	 * @return string
	 */
	private static function csv_safe( $value ) {
		$value = (string) $value;
		return preg_match( '/^[=+\-@\t\r]/', $value ) && ! is_numeric( $value ) ? "'" . $value : $value;
	}

	/**
	 * Maandelijkse e-mail (cron).
	 */
	public static function send_monthly() {
		$to = Settings::get( 'report_email' );
		if ( ! Settings::get( 'report_monthly' ) || ! is_email( $to ) ) {
			return;
		}
		$report = self::build( 30 );
		$html   = '<h2>' . esc_html( $report['company'] ) . ' — ' . esc_html__( 'Maandrapport SEO & Ads', 'clean-seo-ads-ai' ) . '</h2>';
		if ( $report['demo'] ) {
			$html .= '<p><strong>' . esc_html__( 'DEMOMODUS: dit rapport bevat voorbeeldgegevens.', 'clean-seo-ads-ai' ) . '</strong></p>';
		}
		foreach ( $report['sections'] as $section ) {
			$html .= '<h3>' . esc_html( $section['title'] ) . '</h3>';
			if ( isset( $section['error'] ) ) {
				$html .= '<p>' . esc_html( $section['error'] ) . '</p>';
				continue;
			}
			$html .= '<table cellpadding="6" style="border-collapse:collapse">';
			foreach ( $section['rows'] as $row ) {
				$delta = null === $row[2] ? '' : ( $row[2] > 0 ? '+' : '' ) . $row[2] . '%';
				$html .= '<tr><td>' . esc_html( $row[0] ) . '</td><td><strong>' . esc_html( (string) $row[1] ) . '</strong></td><td>' . esc_html( $delta ) . '</td></tr>';
			}
			$html .= '</table>';
		}
		$html .= '<p><a href="' . esc_url( admin_url( 'admin.php?page=csaam-reports' ) ) . '">' . esc_html__( 'Bekijk het volledige rapport in WordPress', 'clean-seo-ads-ai' ) . '</a></p>';
		wp_mail( $to, $report['company'] . ' — ' . __( 'Maandrapport SEO & Ads', 'clean-seo-ads-ai' ), $html, array( 'Content-Type: text/html; charset=UTF-8' ) );
	}
}
