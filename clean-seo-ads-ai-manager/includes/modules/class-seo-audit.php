<?php
/**
 * SEO-audit per pagina met fouten, verbeterkansen en voorgestelde correcties.
 *
 * @package CSAAM
 */

namespace CSAAM\Modules;

use CSAAM\Environment;
use CSAAM\Html_Analyzer;
use CSAAM\Installer;
use CSAAM\Logger;
use CSAAM\Settings;
use CSAAM\Seo_Meta;
use WP_Error;

defined( 'ABSPATH' ) || exit;

/**
 * Seo_Audit.
 */
class Seo_Audit {

	const WEIGHTS = array(
		'error'   => 15,
		'warning' => 5,
		'notice'  => 1,
	);

	/**
	 * Te scannen post-ID's.
	 *
	 * @return int[]
	 */
	public static function post_ids() {
		$types = array_values( array_intersect( (array) Settings::get( 'audit_post_types' ), get_post_types( array( 'public' => true ) ) ) );
		if ( ! $types ) {
			$types = array( 'page' );
		}
		$query = new \WP_Query(
			array(
				'post_type'              => $types,
				'post_status'            => 'publish',
				'posts_per_page'         => 2000,
				'fields'                 => 'ids',
				'orderby'                => 'ID',
				'order'                  => 'ASC',
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
				'has_password'           => false,
			)
		);
		return array_map( 'intval', $query->posts );
	}

	/**
	 * Scant een batch pagina's.
	 *
	 * @param int $offset Start.
	 * @param int $limit  Aantal.
	 * @return array{total:int,done:int,scanned:array}
	 */
	public static function scan_batch( $offset, $limit ) {
		$ids     = self::post_ids();
		$slice   = array_slice( $ids, max( 0, $offset ), max( 1, min( 10, $limit ) ) );
		$scanned = array();
		foreach ( $slice as $id ) {
			$result    = self::scan_post( $id );
			$scanned[] = array(
				'post_id' => $id,
				'score'   => is_wp_error( $result ) ? null : $result['score'],
				'error'   => is_wp_error( $result ) ? $result->get_error_message() : '',
			);
		}
		if ( $offset + count( $slice ) >= count( $ids ) ) {
			self::remove_stale( $ids );
			update_option( 'csaam_last_audit', time(), false );
		}
		return array(
			'total'   => count( $ids ),
			'done'    => min( count( $ids ), $offset + count( $slice ) ),
			'scanned' => $scanned,
		);
	}

	/**
	 * Volledige scan (wekelijkse cron).
	 */
	public static function scan_all() {
		$ids = self::post_ids();
		foreach ( $ids as $i => $id ) {
			self::scan_post( $id );
			if ( $i > 500 ) {
				break;
			}
		}
		self::remove_stale( $ids );
		update_option( 'csaam_last_audit', time(), false );
	}

	/**
	 * Verwijdert resultaten van pagina's die niet meer gepubliceerd zijn.
	 *
	 * @param int[] $ids Huidige ID's.
	 */
	private static function remove_stale( array $ids ) {
		global $wpdb;
		$table = Installer::table( 'audit' );
		if ( ! $ids ) {
			$wpdb->query( "DELETE FROM {$table}" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			return;
		}
		$placeholders = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE post_id NOT IN ({$placeholders})", $ids ) );
	}

	/**
	 * Haalt de gerenderde HTML op (zoals een bezoeker/Google die ziet).
	 *
	 * @param string $url URL.
	 * @return array{html:string,status:int,x_robots:string,ms:int,fallback:bool}|WP_Error
	 */
	private static function fetch( $url ) {
		$start    = microtime( true );
		$response = wp_remote_get(
			$url,
			array(
				'timeout'     => 20,
				'redirection' => 0,
				'headers'     => array( 'Accept' => 'text/html' ),
				'user-agent'  => 'Mozilla/5.0 (compatible; CleanSEOAudit/' . CSAAM_VERSION . ')',
				'sslverify'   => apply_filters( 'https_local_ssl_verify', false ),
				'cookies'     => array(),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		return array(
			'html'     => (string) wp_remote_retrieve_body( $response ),
			'status'   => (int) wp_remote_retrieve_response_code( $response ),
			'x_robots' => strtolower( (string) wp_remote_retrieve_header( $response, 'x-robots-tag' ) ),
			'location' => (string) wp_remote_retrieve_header( $response, 'location' ),
			'ms'       => (int) round( ( microtime( true ) - $start ) * 1000 ),
			'fallback' => false,
		);
	}

	/**
	 * Fallback wanneer loopback-requests geblokkeerd zijn: alleen inhoud.
	 *
	 * @param int $post_id Bericht-ID.
	 * @return array
	 */
	private static function fallback_html( $post_id ) {
		$post    = get_post( $post_id );
		$meta    = Seo_Meta::get( $post_id );
		$title   = $meta['title'] ? $meta['title'] : get_the_title( $post );
		$content = apply_filters( 'the_content', $post->post_content ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound
		$html    = '<html><head><title>' . esc_html( $title ) . '</title>'
			. ( $meta['description'] ? '<meta name="description" content="' . esc_attr( $meta['description'] ) . '">' : '' )
			. '</head><body><main>' . $content . '</main></body></html>';
		return array(
			'html'     => $html,
			'status'   => 200,
			'x_robots' => '',
			'location' => '',
			'ms'       => 0,
			'fallback' => true,
		);
	}

	/**
	 * Actuele analyse van een pagina zonder op te slaan (voor AI-context).
	 *
	 * @param int $post_id Bericht-ID.
	 * @return array
	 */
	public static function snapshot( $post_id ) {
		$fetch = self::fetch( get_permalink( $post_id ) );
		if ( is_wp_error( $fetch ) || 200 !== $fetch['status'] || '' === $fetch['html'] ) {
			$fetch = self::fallback_html( $post_id );
		}
		return Html_Analyzer::analyze( $fetch['html'], get_permalink( $post_id ) );
	}

	/**
	 * Scant één pagina en slaat het resultaat op.
	 *
	 * @param int $post_id Bericht-ID.
	 * @return array|WP_Error
	 */
	public static function scan_post( $post_id ) {
		global $wpdb;
		$post = get_post( $post_id );
		if ( ! $post || 'publish' !== $post->post_status ) {
			return new WP_Error( 'csaam_not_found', __( 'Pagina niet gevonden of niet gepubliceerd.', 'clean-seo-ads-ai' ) );
		}
		$url   = get_permalink( $post );
		$fetch = self::fetch( $url );
		if ( is_wp_error( $fetch ) || $fetch['status'] >= 500 || ( '' === $fetch['html'] && $fetch['status'] < 300 ) ) {
			Logger::info( 'audit', 'Loopback mislukt, fallback gebruikt', array( 'post' => $post_id ) );
			$fetch = self::fallback_html( $post_id );
		}

		$a      = Html_Analyzer::analyze( $fetch['html'], $url );
		$issues = self::evaluate( $post, $url, $fetch, $a );

		$counts = array(
			'error'   => 0,
			'warning' => 0,
			'notice'  => 0,
		);
		foreach ( $issues as $issue ) {
			++$counts[ $issue['severity'] ];
		}
		$score = self::score( $counts );

		$data = array(
			'title'       => $a['title'],
			'description' => $a['description'],
			'canonicals'  => $a['canonicals'],
			'robots'      => trim( $a['robots'] . ',' . $fetch['x_robots'], ',' ),
			'status'      => $fetch['status'],
			'ms'          => $fetch['ms'],
			'fallback'    => $fetch['fallback'],
			'headings'    => array_slice( $a['headings'], 0, 60 ),
			'links'       => $a['links'],
			'images'      => $a['images'],
			'schema'      => $a['schema'],
			'word_count'  => $a['word_count'],
			'lang'        => $a['lang'],
			'issues'      => $issues,
			'minhash'     => Html_Analyzer::minhash( $a['text'], (array) Settings::get( 'cities' ) ),
			'excerpt'     => mb_substr( $a['text'], 0, 300 ),
		);

		$existing = self::get_row( $post_id );
		if ( $existing && isset( $existing['data']['pagespeed'] ) ) {
			$data['pagespeed'] = $existing['data']['pagespeed'];
		}

		$table = Installer::table( 'audit' );
		$row   = array(
			'post_id'     => $post_id,
			'url'         => $url,
			'score'       => $score,
			'errors'      => $counts['error'],
			'warnings'    => $counts['warning'],
			'data'        => wp_json_encode( $data ),
			'fingerprint' => md5( mb_strtolower( $a['text'] ) ),
			'scanned_at'  => current_time( 'mysql', true ),
		);
		if ( $existing ) {
			$wpdb->update( $table, $row, array( 'post_id' => $post_id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		} else {
			$wpdb->insert( $table, $row ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		}

		return array(
			'score'  => $score,
			'issues' => $issues,
		);
	}

	/**
	 * Score uit aantallen.
	 *
	 * @param array $counts error/warning/notice.
	 * @return int
	 */
	public static function score( array $counts ) {
		$penalty = 0;
		foreach ( self::WEIGHTS as $sev => $w ) {
			$penalty += ( isset( $counts[ $sev ] ) ? $counts[ $sev ] : 0 ) * $w;
		}
		return max( 0, 100 - $penalty );
	}

	/**
	 * Maakt een issue.
	 *
	 * @param string $severity error|warning|notice.
	 * @param string $code     Code.
	 * @param string $message  Probleem.
	 * @param string $fix      Voorgestelde correctie.
	 * @param string $ai_task  Bijbehorende AI-taak (optioneel).
	 * @return array
	 */
	private static function issue( $severity, $code, $message, $fix, $ai_task = '' ) {
		return compact( 'severity', 'code', 'message', 'fix', 'ai_task' );
	}

	/**
	 * Alle controles voor één pagina.
	 *
	 * @param \WP_Post $post  Bericht.
	 * @param string   $url   URL.
	 * @param array    $fetch Fetch-resultaat.
	 * @param array    $a     Analyse.
	 * @return array[]
	 */
	private static function evaluate( $post, $url, array $fetch, array $a ) {
		$issues = array();
		$seo    = Environment::seo_label( Environment::seo_plugin() );
		$where  = '' !== Environment::seo_plugin()
			/* translators: %s: naam SEO-plugin */
			? sprintf( __( 'Pas dit aan in %s of laat de AI een voorstel maken.', 'clean-seo-ads-ai' ), $seo )
			: __( 'Laat de AI een voorstel maken of installeer één SEO-plugin (bijv. Rank Math).', 'clean-seo-ads-ai' );

		// Bereikbaarheid.
		if ( $fetch['status'] >= 300 && $fetch['status'] < 400 ) {
			/* translators: %s: doel-URL */
			$issues[] = self::issue( 'warning', 'redirect', sprintf( __( 'De pagina stuurt door naar %s.', 'clean-seo-ads-ai' ), esc_url_raw( $fetch['location'] ) ), __( 'Verwijs interne links direct naar de eindbestemming en controleer of de doorverwijzing gewenst is.', 'clean-seo-ads-ai' ) );
			return $issues;
		}
		if ( 200 !== $fetch['status'] ) {
			/* translators: %d: HTTP-status */
			$issues[] = self::issue( 'error', 'status', sprintf( __( 'De pagina geeft HTTP-status %d.', 'clean-seo-ads-ai' ), $fetch['status'] ), __( 'Zorg dat de pagina status 200 geeft of verwijder haar uit menu\'s en sitemaps.', 'clean-seo-ads-ai' ) );
		}
		if ( $fetch['fallback'] ) {
			$issues[] = self::issue( 'notice', 'fallback', __( 'De live pagina kon niet worden opgehaald (loopback geblokkeerd); alleen de inhoud is gecontroleerd.', 'clean-seo-ads-ai' ), __( 'Vraag de hostingpartij om loopback-verzoeken toe te staan voor een volledige controle (title, canonical, schema).', 'clean-seo-ads-ai' ) );
		}

		// Indexeerbaarheid.
		$robots = $a['robots'] . ',' . $fetch['x_robots'];
		if ( false !== strpos( $robots, 'noindex' ) ) {
			$issues[] = self::issue( 'error', 'noindex', __( 'De pagina staat op noindex en verschijnt niet in Google.', 'clean-seo-ads-ai' ), __( 'Is dit een belangrijke pagina? Zet indexering aan in de SEO-instellingen van deze pagina.', 'clean-seo-ads-ai' ) );
		}
		if ( ! get_option( 'blog_public' ) ) {
			$issues[] = self::issue( 'error', 'blog_private', __( 'De hele site vraagt zoekmachines om niet te indexeren (Instellingen → Lezen).', 'clean-seo-ads-ai' ), __( 'Vink "Zoekmachines ontmoedigen" uit zodra de site live is.', 'clean-seo-ads-ai' ) );
		}

		// Title.
		$tlen = mb_strlen( $a['title'] );
		if ( 0 === $tlen ) {
			$issues[] = self::issue( 'error', 'title_missing', __( 'SEO-titel ontbreekt.', 'clean-seo-ads-ai' ), $where, 'seo_title' );
		} elseif ( $tlen < 30 ) {
			/* translators: %d: aantal tekens */
			$issues[] = self::issue( 'warning', 'title_short', sprintf( __( 'SEO-titel is kort (%d tekens).', 'clean-seo-ads-ai' ), $tlen ), __( 'Gebruik 30–60 tekens met dienst + plaats, bijvoorbeeld "Kantoorschoonmaak Zeist | Clean Schoonmaakbedrijf".', 'clean-seo-ads-ai' ), 'seo_title' );
		} elseif ( $tlen > 60 ) {
			/* translators: %d: aantal tekens */
			$issues[] = self::issue( 'warning', 'title_long', sprintf( __( 'SEO-titel is lang (%d tekens) en wordt waarschijnlijk afgekapt.', 'clean-seo-ads-ai' ), $tlen ), __( 'Kort in tot maximaal ±60 tekens; zet het belangrijkste zoekwoord vooraan.', 'clean-seo-ads-ai' ), 'seo_title' );
		}
		if ( $a['titles'] > 1 ) {
			$issues[] = self::issue( 'error', 'title_multiple', __( 'Er staan meerdere <title>-tags in de pagina.', 'clean-seo-ads-ai' ), __( 'Waarschijnlijk geven thema en SEO-plugin allebei een titel uit. Laat alleen de SEO-plugin dit doen (thema-ondersteuning "title-tag").', 'clean-seo-ads-ai' ) );
		}

		// Meta description.
		$dlen = mb_strlen( $a['description'] );
		if ( 0 === $dlen ) {
			$issues[] = self::issue( 'warning', 'desc_missing', __( 'Meta description ontbreekt.', 'clean-seo-ads-ai' ), $where, 'meta_description' );
		} elseif ( $dlen < 70 ) {
			/* translators: %d: aantal tekens */
			$issues[] = self::issue( 'notice', 'desc_short', sprintf( __( 'Meta description is kort (%d tekens).', 'clean-seo-ads-ai' ), $dlen ), __( 'Schrijf 120–155 tekens met voordeel en een duidelijke oproep (bijv. "Vraag een vrijblijvende offerte aan").', 'clean-seo-ads-ai' ), 'meta_description' );
		} elseif ( $dlen > 160 ) {
			/* translators: %d: aantal tekens */
			$issues[] = self::issue( 'notice', 'desc_long', sprintf( __( 'Meta description is lang (%d tekens).', 'clean-seo-ads-ai' ), $dlen ), __( 'Kort in tot ±155 tekens zodat de kern zichtbaar blijft.', 'clean-seo-ads-ai' ), 'meta_description' );
		}
		if ( $a['descriptions'] > 1 ) {
			$issues[] = self::issue( 'warning', 'desc_multiple', __( 'Er staan meerdere meta descriptions in de pagina.', 'clean-seo-ads-ai' ), __( 'Laat maar één plugin metadata uitvoeren; schakel dubbele SEO-functies uit.', 'clean-seo-ads-ai' ) );
		}

		// Koppen.
		$h1 = array_filter(
			$a['headings'],
			static function ( $h ) {
				return 1 === $h['level'];
			}
		);
		if ( 0 === count( $h1 ) ) {
			$issues[] = self::issue( 'error', 'h1_missing', __( 'Er is geen H1-kop.', 'clean-seo-ads-ai' ), __( 'Geef de pagina één H1 die het hoofdonderwerp (dienst + plaats) beschrijft.', 'clean-seo-ads-ai' ), 'content_review' );
		} elseif ( count( $h1 ) > 1 ) {
			/* translators: %d: aantal */
			$issues[] = self::issue( 'warning', 'h1_multiple', sprintf( __( 'Er zijn %d H1-koppen.', 'clean-seo-ads-ai' ), count( $h1 ) ), __( 'Gebruik precies één H1; maak de overige H2.', 'clean-seo-ads-ai' ) );
		}
		$prev = 0;
		foreach ( $a['headings'] as $h ) {
			if ( $prev && $h['level'] > $prev + 1 ) {
				/* translators: 1: vorig niveau, 2: huidig niveau */
				$issues[] = self::issue( 'notice', 'heading_skip', sprintf( __( 'Kopstructuur slaat een niveau over (H%1$d → H%2$d).', 'clean-seo-ads-ai' ), $prev, $h['level'] ), __( 'Gebruik een logische volgorde H1 → H2 → H3 voor leesbaarheid en toegankelijkheid.', 'clean-seo-ads-ai' ) );
				break;
			}
			$prev = $h['level'];
		}
		$h2 = count(
			array_filter(
				$a['headings'],
				static function ( $h ) {
					return 2 === $h['level'];
				}
			)
		);
		if ( 0 === $h2 && $a['word_count'] > 300 ) {
			$issues[] = self::issue( 'notice', 'h2_missing', __( 'Geen H2-tussenkoppen bij een langere tekst.', 'clean-seo-ads-ai' ), __( 'Deel de tekst op met H2\'s die vragen van klanten beantwoorden (werkwijze, prijsopbouw, werkgebied).', 'clean-seo-ads-ai' ), 'content_review' );
		}

		// Inhoud.
		if ( $a['word_count'] < 300 && (int) get_option( 'page_on_front' ) !== (int) $post->ID ) {
			/* translators: %d: aantal woorden */
			$issues[] = self::issue( 'warning', 'thin', sprintf( __( 'Weinig tekst (%d woorden).', 'clean-seo-ads-ai' ), $a['word_count'] ), __( 'Vul aan met unieke, nuttige informatie: werkwijze, frequentie, voor wie, veelgestelde vragen.', 'clean-seo-ads-ai' ), 'missing_topics' );
		}

		// Interne links.
		if ( $a['links']['internal'] < 2 ) {
			/* translators: %d: aantal */
			$issues[] = self::issue( 'warning', 'internal_links', sprintf( __( 'Weinig interne links in de inhoud (%d).', 'clean-seo-ads-ai' ), $a['links']['internal'] ), __( 'Link naar verwante diensten, de offertepagina en relevante plaatspagina\'s.', 'clean-seo-ads-ai' ), 'internal_links' );
		}

		// Canonical.
		$canonicals = array_unique( $a['canonicals'] );
		if ( ! $canonicals ) {
			$issues[] = self::issue( 'warning', 'canonical_missing', __( 'Canonical URL ontbreekt.', 'clean-seo-ads-ai' ), __( 'Laat de SEO-plugin een self-referencing canonical uitvoeren.', 'clean-seo-ads-ai' ) );
		} elseif ( count( $canonicals ) > 1 ) {
			$issues[] = self::issue( 'error', 'canonical_multiple', __( 'Meerdere verschillende canonical URL\'s.', 'clean-seo-ads-ai' ), __( 'Laat slechts één plugin de canonical uitvoeren.', 'clean-seo-ads-ai' ) );
		} elseif ( untrailingslashit( strtok( reset( $canonicals ), '?#' ) ) !== untrailingslashit( strtok( $url, '?#' ) ) ) {
			/* translators: %s: canonical */
			$issues[] = self::issue( 'notice', 'canonical_other', sprintf( __( 'Canonical verwijst naar een andere URL: %s', 'clean-seo-ads-ai' ), esc_url_raw( reset( $canonicals ) ) ), __( 'Controleer of dit bewust is; anders wordt deze pagina niet zelf geïndexeerd.', 'clean-seo-ads-ai' ) );
		}

		// Mobiel.
		if ( ! $fetch['fallback'] && ! $a['viewport'] ) {
			$issues[] = self::issue( 'error', 'viewport', __( 'Meta viewport ontbreekt; de pagina is niet mobielvriendelijk.', 'clean-seo-ads-ai' ), __( 'Gebruik een responsive thema met <meta name="viewport" content="width=device-width, initial-scale=1">.', 'clean-seo-ads-ai' ) );
		}
		if ( ! $fetch['fallback'] && '' === $a['lang'] ) {
			$issues[] = self::issue( 'notice', 'lang', __( 'Taal (lang-attribuut) ontbreekt.', 'clean-seo-ads-ai' ), __( 'Stel de sitetaal in op Nederlands (Instellingen → Algemeen).', 'clean-seo-ads-ai' ) );
		}

		// Afbeeldingen.
		if ( $a['images']['missing_alt'] > 0 ) {
			/* translators: %d: aantal */
			$issues[] = self::issue( 'warning', 'img_alt', sprintf( __( '%d afbeelding(en) zonder alt-tekst.', 'clean-seo-ads-ai' ), $a['images']['missing_alt'] ), __( 'Beschrijf kort wat er te zien is (bijv. "Glasbewassing bij kantoorpand in Zeist"). Decoratieve afbeeldingen krijgen alt="".', 'clean-seo-ads-ai' ) );
		}
		if ( $a['images']['no_dimensions'] > 0 ) {
			/* translators: %d: aantal */
			$issues[] = self::issue( 'notice', 'img_dims', sprintf( __( '%d afbeelding(en) zonder breedte/hoogte (layoutverschuiving).', 'clean-seo-ads-ai' ), $a['images']['no_dimensions'] ), __( 'Voeg via de mediabibliotheek ingevoegde afbeeldingen toe; die krijgen automatisch afmetingen.', 'clean-seo-ads-ai' ) );
		}

		// Structured data (alleen controleren; nooit dubbel toevoegen).
		if ( ! $fetch['fallback'] ) {
			if ( $a['schema']['invalid'] > 0 ) {
				$issues[] = self::issue( 'error', 'schema_invalid', __( 'Ongeldige JSON-LD structured data gevonden.', 'clean-seo-ads-ai' ), __( 'Controleer met de Rich Results Test van Google welke plugin dit veroorzaakt.', 'clean-seo-ads-ai' ) );
			}
			if ( 0 === $a['schema']['blocks'] ) {
				$issues[] = self::issue( 'notice', 'schema_missing', __( 'Geen structured data (schema.org) gevonden.', 'clean-seo-ads-ai' ), __( 'Schakel schema in via de SEO-plugin. Deze plugin voegt bewust geen eigen schema toe om duplicaten te voorkomen.', 'clean-seo-ads-ai' ) );
			} elseif ( (int) get_option( 'page_on_front' ) === (int) $post->ID ) {
				$local = array_intersect( $a['schema']['types'], array( 'LocalBusiness', 'ProfessionalService', 'HomeAndConstructionBusiness', 'Organization', 'CleaningService' ) );
				if ( ! $local ) {
					$issues[] = self::issue( 'notice', 'schema_local', __( 'Homepage heeft geen Organization/LocalBusiness-schema.', 'clean-seo-ads-ai' ), __( 'Vul in de SEO-plugin de bedrijfsgegevens (Local SEO) in met het echte adres en telefoonnummer.', 'clean-seo-ads-ai' ) );
				}
			}
		}

		return $issues;
	}

	/**
	 * Eén auditrij.
	 *
	 * @param int $post_id Bericht-ID.
	 * @return array|null
	 */
	public static function get_row( $post_id ) {
		global $wpdb;
		$table = Installer::table( 'audit' );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE post_id = %d", $post_id ), ARRAY_A );
		if ( ! $row ) {
			return null;
		}
		$row['data'] = json_decode( $row['data'], true );
		return $row;
	}

	/**
	 * Alle resultaten inclusief sitebrede controles (duplicaten, sitemap).
	 *
	 * @return array{pages:array,summary:array}
	 */
	public static function results() {
		global $wpdb;
		$table = Installer::table( 'audit' );
		$rows  = $wpdb->get_results( "SELECT * FROM {$table} ORDER BY score ASC", ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		$by_title = array();
		$by_desc  = array();
		foreach ( $rows as $i => $row ) {
			$rows[ $i ]['data'] = json_decode( $row['data'], true );
			$d                  = $rows[ $i ]['data'];
			if ( ! empty( $d['title'] ) ) {
				$by_title[ mb_strtolower( $d['title'] ) ][] = $i;
			}
			if ( ! empty( $d['description'] ) ) {
				$by_desc[ mb_strtolower( $d['description'] ) ][] = $i;
			}
		}

		$extra = array();
		foreach ( $by_title as $group ) {
			if ( count( $group ) > 1 ) {
				foreach ( $group as $i ) {
					$extra[ $i ][] = self::issue( 'warning', 'title_duplicate', __( 'Dezelfde SEO-titel wordt op meerdere pagina\'s gebruikt.', 'clean-seo-ads-ai' ), __( 'Maak elke titel uniek met de specifieke dienst en plaats.', 'clean-seo-ads-ai' ), 'seo_title' );
				}
			}
		}
		foreach ( $by_desc as $group ) {
			if ( count( $group ) > 1 ) {
				foreach ( $group as $i ) {
					$extra[ $i ][] = self::issue( 'warning', 'desc_duplicate', __( 'Dezelfde meta description wordt op meerdere pagina\'s gebruikt.', 'clean-seo-ads-ai' ), __( 'Schrijf per pagina een unieke description.', 'clean-seo-ads-ai' ), 'meta_description' );
				}
			}
		}

		// Bijna-dubbele inhoud.
		$n = count( $rows );
		for ( $i = 0; $i < $n; $i++ ) {
			for ( $j = $i + 1; $j < $n; $j++ ) {
				$a = isset( $rows[ $i ]['data']['minhash'] ) ? $rows[ $i ]['data']['minhash'] : array();
				$b = isset( $rows[ $j ]['data']['minhash'] ) ? $rows[ $j ]['data']['minhash'] : array();
				if ( ! $a || ! $b ) {
					continue;
				}
				$sim = Html_Analyzer::similarity( $a, $b );
				if ( $sim >= 0.7 ) {
					foreach ( array( array( $i, $j ), array( $j, $i ) ) as $pair ) {
						$extra[ $pair[0] ][] = self::issue(
							$sim >= 0.85 ? 'warning' : 'notice',
							'duplicate_content',
							/* translators: 1: percentage, 2: paginatitel */
							sprintf( __( 'Inhoud is voor ±%1$d%% gelijk aan "%2$s".', 'clean-seo-ads-ai' ), round( $sim * 100 ), get_the_title( (int) $rows[ $pair[1] ]['post_id'] ) ),
							__( 'Maak de tekst uniek (lokale situatie, specifieke werkwijze, eigen voorbeelden) of voeg pagina\'s samen. Bijna identieke stadspagina\'s kunnen als doorway pages worden gezien.', 'clean-seo-ads-ai' ),
							'content_review'
						);
					}
				}
			}
		}

		// Sitemap-dekking (alleen als de sitemap al is opgehaald).
		$sitemap = Technical_Check::cached_sitemap_urls();
		$summary = array(
			'pages'    => $n,
			'avg'      => 0,
			'errors'   => 0,
			'warnings' => 0,
			'notices'  => 0,
			'last'     => (int) get_option( 'csaam_last_audit', 0 ),
		);
		$pages   = array();
		foreach ( $rows as $i => $row ) {
			$d      = $row['data'];
			$issues = array_merge( isset( $d['issues'] ) ? $d['issues'] : array(), isset( $extra[ $i ] ) ? $extra[ $i ] : array() );
			if ( is_array( $sitemap ) && $sitemap && false === strpos( (string) $d['robots'], 'noindex' ) && ! in_array( untrailingslashit( $row['url'] ), $sitemap, true ) ) {
				$issues[] = self::issue( 'notice', 'not_in_sitemap', __( 'Pagina staat niet in de XML-sitemap.', 'clean-seo-ads-ai' ), __( 'Controleer de sitemap-instellingen van de SEO-plugin.', 'clean-seo-ads-ai' ) );
			}
			$rank = array_flip( array( 'error', 'warning', 'notice' ) );
			usort(
				$issues,
				static function ( $x, $y ) use ( $rank ) {
					return $rank[ $x['severity'] ] - $rank[ $y['severity'] ];
				}
			);
			$counts = array(
				'error'   => 0,
				'warning' => 0,
				'notice'  => 0,
			);
			foreach ( $issues as $issue ) {
				++$counts[ $issue['severity'] ];
			}
			unset( $d['minhash'] );
			$pages[]              = array(
				'post_id'    => (int) $row['post_id'],
				'title'      => get_the_title( (int) $row['post_id'] ),
				'url'        => $row['url'],
				'edit_url'   => get_edit_post_link( (int) $row['post_id'], 'raw' ),
				'score'      => self::score( $counts ),
				'counts'     => $counts,
				'issues'     => $issues,
				'data'       => $d,
				'scanned_at' => $row['scanned_at'],
			);
			$summary['errors']   += $counts['error'];
			$summary['warnings'] += $counts['warning'];
			$summary['notices']  += $counts['notice'];
		}
		usort(
			$pages,
			static function ( $x, $y ) {
				return $x['score'] - $y['score'];
			}
		);
		if ( $n ) {
			$summary['avg'] = (int) round( array_sum( wp_list_pluck( $pages, 'score' ) ) / $n );
		}
		return array(
			'pages'   => $pages,
			'summary' => $summary,
		);
	}
}
