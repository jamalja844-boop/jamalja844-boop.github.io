<?php
/**
 * Lokale SEO: dekking van diensten × werkgebied, uniciteit van lokale
 * landingspagina's en consistente bedrijfsgegevens. Genereert bewust geen
 * massale stadspagina's, vestigingen, reviews of klantgegevens.
 *
 * @package CSAAM
 */

namespace CSAAM\Modules;

use CSAAM\Html_Analyzer;
use CSAAM\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Local_SEO.
 */
class Local_SEO {

	/**
	 * Normaliseert tekst voor vergelijking (kleine letters, geen streepjes/accenten).
	 *
	 * @param string $text Tekst.
	 * @return string
	 */
	public static function norm( $text ) {
		$text = remove_accents( mb_strtolower( (string) $text ) );
		return trim( preg_replace( '/[^a-z0-9]+/', ' ', $text ) );
	}

	/**
	 * Stam van een dienstnaam voor matching (bijv. "VvE-schoonmaak" → "vve schoonmaak").
	 *
	 * @param string $service Dienst.
	 * @return string[] Varianten.
	 */
	private static function service_variants( $service ) {
		$n        = self::norm( $service );
		$variants = array( $n, str_replace( ' ', '', $n ) );
		$map      = array(
			'glasbewassing'         => array( 'glazenwasser', 'glasbewassing', 'ramen wassen' ),
			'trappenhuisreiniging'  => array( 'trappenhuis' ),
			'vloeronderhoud'        => array( 'vloer' ),
			'opleverschoonmaak'     => array( 'oplever' ),
			'periodieke schoonmaak' => array( 'periodiek' ),
		);
		if ( isset( $map[ $n ] ) ) {
			$variants = array_merge( $variants, $map[ $n ] );
		}
		return array_unique( $variants );
	}

	/**
	 * Bevat de haystack een van de varianten als heel woord(deel)?
	 *
	 * @param string   $haystack Genormaliseerde tekst.
	 * @param string[] $needles  Varianten.
	 * @return bool
	 */
	private static function contains( $haystack, array $needles ) {
		foreach ( $needles as $needle ) {
			if ( '' !== $needle && false !== strpos( ' ' . $haystack . ' ', ' ' . $needle ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Matrix diensten × plaatsen met de best passende pagina per cel.
	 *
	 * @return array
	 */
	public static function overview() {
		$cities   = (array) Settings::get( 'cities' );
		$services = (array) Settings::get( 'services' );
		$audit    = Seo_Audit::results();
		$pages    = $audit['pages'];

		$index = array();
		foreach ( $pages as $p ) {
			$h1 = '';
			foreach ( (array) ( isset( $p['data']['headings'] ) ? $p['data']['headings'] : array() ) as $h ) {
				if ( 1 === $h['level'] ) {
					$h1 = $h['text'];
					break;
				}
			}
			$index[] = array(
				'page'  => $p,
				'title' => self::norm( $p['data']['title'] . ' ' . $p['title'] ),
				'h1'    => self::norm( $h1 ),
				'slug'  => self::norm( (string) wp_parse_url( $p['url'], PHP_URL_PATH ) ),
				'desc'  => self::norm( $p['data']['description'] ),
			);
		}

		$matrix     = array();
		$city_pages = array();
		foreach ( $services as $service ) {
			$sv  = self::service_variants( $service );
			$row = array(
				'service' => $service,
				'cells'   => array(),
			);
			foreach ( $cities as $city ) {
				$cn    = array( self::norm( $city ) );
				$best  = null;
				$score = 0;
				foreach ( $index as $item ) {
					$s = 0;
					foreach ( array(
						'title' => 3,
						'h1'    => 3,
						'slug'  => 2,
						'desc'  => 1,
					) as $field => $weight ) {
						if ( self::contains( $item[ $field ], $sv ) && self::contains( $item[ $field ], $cn ) ) {
							$s += $weight;
						}
					}
					if ( $s > $score ) {
						$score = $s;
						$best  = $item['page'];
					}
				}
				$cell = array(
					'city'   => $city,
					'status' => 'missing',
					'page'   => null,
					'checks' => array(),
				);
				if ( $best ) {
					$cell['page']                   = array(
						'post_id' => $best['post_id'],
						'title'   => $best['title'],
						'url'     => $best['url'],
						'score'   => $best['score'],
					);
					$cell['checks']                 = self::checks( $best, $service, $city );
					$cell['status']                 = $score >= 5 && ! array_filter(
						$cell['checks'],
						static function ( $c ) {
							return ! $c['ok'];
						}
					) ? 'good' : 'improve';
					$city_pages[ $best['post_id'] ] = $best;
				}
				$row['cells'][] = $cell;
			}
			$matrix[] = $row;
		}

		return array(
			'cities'     => $cities,
			'services'   => $services,
			'matrix'     => $matrix,
			'uniqueness' => self::uniqueness( array_values( $city_pages ) ),
			'nap'        => self::nap_check( $pages ),
			'advice'     => array(
				__( 'Maak alleen een lokale pagina voor plaatsen waar u echt werkt, met unieke inhoud (bijv. type panden, bereikbaarheid, lokale voorbeelden die u mag noemen).', 'clean-seo-ads-ai' ),
				__( 'Geen nep-vestigingen of adressen per plaats: Google Bedrijfsprofiel hoort bij uw echte adres in Zeist, met een servicegebied voor de andere plaatsen.', 'clean-seo-ads-ai' ),
				__( 'Vaak is één sterke dienstpagina met een duidelijk werkgebied beter dan acht bijna-identieke stadspagina\'s.', 'clean-seo-ads-ai' ),
			),
			'scanned'    => $audit['summary']['last'],
		);
	}

	/**
	 * Controles voor één lokale pagina.
	 *
	 * @param array  $page    Auditpagina.
	 * @param string $service Dienst.
	 * @param string $city    Plaats.
	 * @return array[]
	 */
	private static function checks( array $page, $service, $city ) {
		$sv    = self::service_variants( $service );
		$cn    = array( self::norm( $city ) );
		$title = self::norm( $page['data']['title'] );
		$desc  = self::norm( $page['data']['description'] );
		$h1    = '';
		foreach ( (array) $page['data']['headings'] as $h ) {
			if ( 1 === $h['level'] ) {
				$h1 = self::norm( $h['text'] );
				break;
			}
		}
		$words = (int) $page['data']['word_count'];
		$dupe  = array_filter(
			$page['issues'],
			static function ( $i ) {
				return 'duplicate_content' === $i['code'] && 'warning' === $i['severity'];
			}
		);
		return array(
			array(
				'label' => __( 'Plaats + dienst in SEO-titel', 'clean-seo-ads-ai' ),
				'ok'    => self::contains( $title, $sv ) && self::contains( $title, $cn ),
			),
			array(
				'label' => __( 'Plaats + dienst in H1', 'clean-seo-ads-ai' ),
				'ok'    => self::contains( $h1, $sv ) && self::contains( $h1, $cn ),
			),
			array(
				'label' => __( 'Plaats in meta description', 'clean-seo-ads-ai' ),
				'ok'    => self::contains( $desc, $cn ),
			),
			array(
				/* translators: %d: woorden */
				'label' => sprintf( __( 'Voldoende unieke tekst (%d woorden, advies ≥ 400)', 'clean-seo-ads-ai' ), $words ),
				'ok'    => $words >= 400,
			),
			array(
				'label' => __( 'Niet (bijna) gelijk aan andere pagina\'s', 'clean-seo-ads-ai' ),
				'ok'    => ! $dupe,
			),
			array(
				'label' => __( 'Interne links aanwezig', 'clean-seo-ads-ai' ),
				'ok'    => (int) $page['data']['links']['internal'] >= 2,
			),
		);
	}

	/**
	 * Onderlinge gelijkenis van lokale pagina's (doorway-risico).
	 *
	 * @param array $pages Pagina's.
	 * @return array
	 */
	private static function uniqueness( array $pages ) {
		global $wpdb;
		$table = \CSAAM\Installer::table( 'audit' );
		$sigs  = array();
		foreach ( $pages as $p ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$raw = $wpdb->get_var( $wpdb->prepare( "SELECT data FROM {$table} WHERE post_id = %d", $p['post_id'] ) );
			$d   = json_decode( (string) $raw, true );
			if ( ! empty( $d['minhash'] ) ) {
				$sigs[ $p['post_id'] ] = $d['minhash'];
			}
		}
		$pairs = array();
		$ids   = array_keys( $sigs );
		$n     = count( $ids );
		for ( $i = 0; $i < $n; $i++ ) {
			for ( $j = $i + 1; $j < $n; $j++ ) {
				$sim = Html_Analyzer::similarity( $sigs[ $ids[ $i ] ], $sigs[ $ids[ $j ] ] );
				if ( $sim >= 0.5 ) {
					$pairs[] = array(
						'a'          => get_the_title( $ids[ $i ] ),
						'b'          => get_the_title( $ids[ $j ] ),
						'similarity' => (int) round( $sim * 100 ),
					);
				}
			}
		}
		usort(
			$pairs,
			static function ( $x, $y ) {
				return $y['similarity'] - $x['similarity'];
			}
		);
		return $pairs;
	}

	/**
	 * Controleert of ingestelde NAW-gegevens consistent op de site staan.
	 *
	 * @param array $pages Auditpagina's.
	 * @return array
	 */
	private static function nap_check( array $pages ) {
		$phone   = (string) Settings::get( 'company_phone' );
		$address = (string) Settings::get( 'company_address' );
		$out     = array(
			'phone_set'   => '' !== $phone,
			'address_set' => '' !== $address,
			'note'        => '',
		);
		if ( '' === $phone || '' === $address ) {
			$out['note'] = __( 'Vul bij Instellingen het echte adres en telefoonnummer in om de consistentie (NAW) te controleren. De plugin verzint deze gegevens niet.', 'clean-seo-ads-ai' );
		}
		$front                  = (int) get_option( 'page_on_front' );
		$url                    = $front ? get_permalink( $front ) : home_url( '/' );
		$res                    = wp_remote_get(
			$url,
			array(
				'timeout'   => 15,
				'sslverify' => apply_filters( 'https_local_ssl_verify', false ),
			)
		);
		$html                   = is_wp_error( $res ) ? '' : wp_strip_all_tags( (string) wp_remote_retrieve_body( $res ) );
		$digits                 = preg_replace( '/\D/', '', $phone );
		$out['phone_on_home']   = $digits && false !== strpos( preg_replace( '/\D/', '', $html ), ltrim( $digits, '0' ) );
		$out['address_on_home'] = $address && false !== mb_stripos( Html_Analyzer::clean( $html ), strtok( $address, ',' ) );
		$out['checked_url']     = $url;
		return $out;
	}
}
