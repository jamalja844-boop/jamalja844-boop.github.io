<?php
/**
 * Technische controle: indexering, sitemap, robots.txt, HTTPS, dubbele
 * tracking, consent, conflicten tussen SEO-plugins en serverinstellingen.
 *
 * @package CSAAM
 */

namespace CSAAM\Modules;

use CSAAM\Cache;
use CSAAM\Environment;
use CSAAM\Integrations\Search_Console;
use CSAAM\Settings;

defined( 'ABSPATH' ) || exit;

/**
 * Technical_Check.
 */
class Technical_Check {

	/**
	 * Ophalen van een URL van de eigen site.
	 *
	 * @param string $url URL.
	 * @return array{status:int,body:string}
	 */
	private static function get( $url ) {
		$res = wp_remote_get(
			$url,
			array(
				'timeout'     => 15,
				'redirection' => 3,
				'sslverify'   => apply_filters( 'https_local_ssl_verify', false ),
				'user-agent'  => 'Mozilla/5.0 (compatible; CleanSEOAudit/' . CSAAM_VERSION . ')',
			)
		);
		if ( is_wp_error( $res ) ) {
			return array(
				'status' => 0,
				'body'   => '',
			);
		}
		return array(
			'status' => (int) wp_remote_retrieve_response_code( $res ),
			'body'   => (string) wp_remote_retrieve_body( $res ),
		);
	}

	/**
	 * Resultaatregel.
	 *
	 * @param string $group  Groep.
	 * @param string $label  Controle.
	 * @param string $status ok|warning|error|info.
	 * @param string $detail Toelichting.
	 * @param string $fix    Oplossing.
	 * @return array
	 */
	private static function row( $group, $label, $status, $detail, $fix = '' ) {
		return compact( 'group', 'label', 'status', 'detail', 'fix' );
	}

	/**
	 * Alle controles (1 uur gecachet).
	 *
	 * @param bool $refresh Cache negeren.
	 * @return array
	 */
	public static function run( $refresh = false ) {
		return Cache::remember(
			'technical',
			'run',
			static function () {
				return self::run_checks();
			},
			$refresh
		);
	}

	/**
	 * Voert de controles uit.
	 *
	 * @return array
	 */
	private static function run_checks() {
		$rows = array();
		$g    = __( 'Server en WordPress', 'clean-seo-ads-ai' );

		// PHP.
		if ( version_compare( PHP_VERSION, '8.1', '>=' ) ) {
			/* translators: %s: PHP-versie */
			$rows[] = self::row( $g, 'PHP', 'ok', sprintf( __( 'PHP %s', 'clean-seo-ads-ai' ), PHP_VERSION ) );
		} else {
			/* translators: %s: PHP-versie */
			$rows[] = self::row( $g, 'PHP', 'warning', sprintf( __( 'PHP %s krijgt geen beveiligingsupdates meer.', 'clean-seo-ads-ai' ), PHP_VERSION ), __( 'Vraag uw hostingpartij om PHP 8.2 of hoger.', 'clean-seo-ads-ai' ) );
		}

		// WordPress-updates.
		$core = get_site_transient( 'update_core' );
		$upd  = false;
		if ( isset( $core->updates ) && is_array( $core->updates ) ) {
			foreach ( $core->updates as $u ) {
				if ( isset( $u->response ) && 'upgrade' === $u->response ) {
					$upd = $u->current;
				}
			}
		}
		$rows[] = $upd
			/* translators: %s: versie */
			? self::row( $g, 'WordPress', 'warning', sprintf( __( 'Update beschikbaar naar %s.', 'clean-seo-ads-ai' ), $upd ), __( 'Maak een back-up en werk WordPress bij.', 'clean-seo-ads-ai' ) )
			/* translators: %s: versie */
			: self::row( $g, 'WordPress', 'ok', sprintf( __( 'Versie %s', 'clean-seo-ads-ai' ), get_bloginfo( 'version' ) ) );

		$https  = 0 === strpos( home_url(), 'https://' ) && 0 === strpos( site_url(), 'https://' );
		$rows[] = $https ? self::row( $g, 'HTTPS', 'ok', home_url() ) : self::row( $g, 'HTTPS', 'error', __( 'De site gebruikt geen HTTPS.', 'clean-seo-ads-ai' ), __( 'Activeer een SSL-certificaat en zet WordPress- en site-adres op https://.', 'clean-seo-ads-ai' ) );

		$rows[] = get_option( 'blog_public' )
			? self::row( $g, __( 'Zichtbaarheid voor zoekmachines', 'clean-seo-ads-ai' ), 'ok', __( 'Zoekmachines mogen de site indexeren.', 'clean-seo-ads-ai' ) )
			: self::row( $g, __( 'Zichtbaarheid voor zoekmachines', 'clean-seo-ads-ai' ), 'error', __( '"Zoekmachines ontmoedigen" staat aan.', 'clean-seo-ads-ai' ), __( 'Instellingen → Lezen → vink uit.', 'clean-seo-ads-ai' ) );

		$rows[] = get_option( 'permalink_structure' )
			? self::row( $g, __( 'Permalinks', 'clean-seo-ads-ai' ), 'ok', get_option( 'permalink_structure' ) )
			: self::row( $g, __( 'Permalinks', 'clean-seo-ads-ai' ), 'warning', __( 'Standaard (?p=123) permalinks.', 'clean-seo-ads-ai' ), __( 'Kies "Berichtnaam" bij Instellingen → Permalinks.', 'clean-seo-ads-ai' ) );

		$rows[] = 0 === strpos( get_locale(), 'nl' )
			? self::row( $g, __( 'Sitetaal', 'clean-seo-ads-ai' ), 'ok', get_locale() )
			: self::row( $g, __( 'Sitetaal', 'clean-seo-ads-ai' ), 'warning', get_locale(), __( 'Zet de sitetaal op Nederlands voor een correct lang-attribuut.', 'clean-seo-ads-ai' ) );

		if ( defined( 'WP_DEBUG_DISPLAY' ) && WP_DEBUG_DISPLAY && defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			$rows[] = self::row( $g, 'Debug', 'warning', __( 'Foutmeldingen worden op de site getoond.', 'clean-seo-ads-ai' ), __( 'Zet WP_DEBUG_DISPLAY uit op de live site.', 'clean-seo-ads-ai' ) );
		}
		$caches = Environment::cache_plugins();
		$rows[] = $caches
			? self::row( $g, __( 'Paginacache', 'clean-seo-ads-ai' ), 'ok', implode( ', ', $caches ) )
			: self::row( $g, __( 'Paginacache', 'clean-seo-ads-ai' ), 'info', __( 'Geen cacheplugin gedetecteerd (mogelijk regelt de hosting dit).', 'clean-seo-ads-ai' ), __( 'Overweeg een cacheplugin of servercache voor snellere laadtijden.', 'clean-seo-ads-ai' ) );
		$rows[] = self::row( $g, __( 'Objectcache', 'clean-seo-ads-ai' ), wp_using_ext_object_cache() ? 'ok' : 'info', wp_using_ext_object_cache() ? __( 'Actief', 'clean-seo-ads-ai' ) : __( 'Niet actief; transients worden in de database opgeslagen.', 'clean-seo-ads-ai' ) );
		if ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) {
			$rows[] = self::row( $g, 'WP-Cron', 'info', __( 'WP-Cron is uitgeschakeld; zorg voor een servercron, anders draaien de wekelijkse audit en rapportages niet.', 'clean-seo-ads-ai' ) );
		}

		// SEO-plugins.
		$s   = __( 'SEO-configuratie', 'clean-seo-ads-ai' );
		$seo = Environment::seo_plugins();
		if ( count( $seo ) > 1 ) {
			$rows[] = self::row( $s, __( 'SEO-plugins', 'clean-seo-ads-ai' ), 'error', implode( ', ', array_map( array( Environment::class, 'seo_label' ), $seo ) ), __( 'Meerdere SEO-plugins geven dubbele titels, meta, sitemaps en schema. Houd er één actief.', 'clean-seo-ads-ai' ) );
		} elseif ( 1 === count( $seo ) ) {
			/* translators: %s: plugin */
			$rows[] = self::row( $s, __( 'SEO-plugins', 'clean-seo-ads-ai' ), 'ok', sprintf( __( '%s actief. Deze plugin voegt geen eigen metadata, sitemaps of schema toe.', 'clean-seo-ads-ai' ), Environment::seo_label( $seo[0] ) ) );
		} else {
			$rows[] = self::row( $s, __( 'SEO-plugins', 'clean-seo-ads-ai' ), 'warning', __( 'Geen SEO-plugin actief.', 'clean-seo-ads-ai' ), __( 'Installeer één SEO-plugin (bijv. Rank Math) voor sitemaps, canonicals en schema.', 'clean-seo-ads-ai' ) );
		}

		// robots.txt en sitemap.
		$robots = self::get( home_url( '/robots.txt' ) );
		$maps   = array();
		if ( 200 === $robots['status'] ) {
			preg_match_all( '/^\s*sitemap:\s*(\S+)/im', $robots['body'], $m );
			$maps = $m[1];
			if ( self::robots_blocks_all( $robots['body'] ) ) {
				$rows[] = self::row( $s, 'robots.txt', 'error', __( 'robots.txt blokkeert de hele site (Disallow: /).', 'clean-seo-ads-ai' ), __( 'Verwijder de regel "Disallow: /" voor User-agent: *.', 'clean-seo-ads-ai' ) );
			} else {
				$rows[] = self::row( $s, 'robots.txt', $maps ? 'ok' : 'warning', $maps ? __( 'Bereikbaar, met sitemap-verwijzing.', 'clean-seo-ads-ai' ) : __( 'Bereikbaar, maar zonder Sitemap-regel.', 'clean-seo-ads-ai' ), $maps ? '' : __( 'Laat de SEO-plugin de sitemap aan robots.txt toevoegen.', 'clean-seo-ads-ai' ) );
			}
		} else {
			$rows[] = self::row( $s, 'robots.txt', 'warning', __( 'robots.txt niet bereikbaar.', 'clean-seo-ads-ai' ) );
		}
		if ( ! $maps ) {
			$maps = array( home_url( '/sitemap_index.xml' ), home_url( '/sitemap.xml' ), home_url( '/wp-sitemap.xml' ) );
		}
		$urls  = null;
		$found = '';
		foreach ( $maps as $map ) {
			$urls = self::sitemap_urls( $map );
			if ( is_array( $urls ) ) {
				$found = $map;
				break;
			}
		}
		if ( is_array( $urls ) ) {
			set_transient( 'csaam_sitemap_urls', $urls, DAY_IN_SECONDS );
			/* translators: 1: URL, 2: aantal */
			$rows[] = self::row( $s, __( 'XML-sitemap', 'clean-seo-ads-ai' ), $urls ? 'ok' : 'warning', sprintf( __( '%1$s (%2$d URL\'s)', 'clean-seo-ads-ai' ), $found, count( $urls ) ) );
		} else {
			$rows[] = self::row( $s, __( 'XML-sitemap', 'clean-seo-ads-ai' ), 'error', __( 'Geen geldige XML-sitemap gevonden.', 'clean-seo-ads-ai' ), __( 'Schakel de sitemap in de SEO-plugin in en dien hem in bij Search Console.', 'clean-seo-ads-ai' ) );
		}

		$gsc_maps = Search_Console::sitemaps();
		if ( ! is_wp_error( $gsc_maps ) ) {
			$errors = array_sum( wp_list_pluck( $gsc_maps, 'errors' ) );
			if ( ! $gsc_maps ) {
				$rows[] = self::row( $s, __( 'Sitemap in Search Console', 'clean-seo-ads-ai' ), 'warning', __( 'Geen sitemap ingediend.', 'clean-seo-ads-ai' ), __( 'Dien de sitemap-URL in via Search Console → Sitemaps.', 'clean-seo-ads-ai' ) );
			} else {
				/* translators: 1: aantal sitemaps, 2: aantal fouten */
				$rows[] = self::row( $s, __( 'Sitemap in Search Console', 'clean-seo-ads-ai' ), $errors ? 'warning' : 'ok', sprintf( __( '%1$d ingediend, %2$d fouten.', 'clean-seo-ads-ai' ), count( $gsc_maps ), $errors ) );
			}
		}

		$nf     = self::get( home_url( '/csaam-niet-bestaand-' . wp_rand( 1000, 9999 ) . '/' ) );
		$rows[] = 404 === $nf['status']
			? self::row( $s, __( '404-pagina', 'clean-seo-ads-ai' ), 'ok', __( 'Niet-bestaande pagina\'s geven status 404.', 'clean-seo-ads-ai' ) )
			/* translators: %d: status */
			: self::row( $s, __( '404-pagina', 'clean-seo-ads-ai' ), 'warning', sprintf( __( 'Niet-bestaande pagina\'s geven status %d (soft 404).', 'clean-seo-ads-ai' ), $nf['status'] ), __( 'Controleer redirect-plugins die alles naar de homepage sturen.', 'clean-seo-ads-ai' ) );

		// Tracking en consent op de homepage.
		$t    = __( 'Tracking en privacy', 'clean-seo-ads-ai' );
		$home = self::get( home_url( '/' ) );
		if ( 200 !== $home['status'] ) {
			/* translators: %d: status */
			$rows[] = self::row( $t, __( 'Homepage', 'clean-seo-ads-ai' ), 'warning', sprintf( __( 'Homepage niet op te halen (status %d); trackingcontrole overgeslagen.', 'clean-seo-ads-ai' ), $home['status'] ) );
		} else {
			$html = $home['body'];
			preg_match_all( '/googletagmanager\.com\/gtag\/js\?id=((?:G|AW|UA)-[A-Z0-9\-]+)/i', $html, $gtag );
			preg_match_all( '/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/', $html, $gtm );
			$gtag_ids = array_unique( $gtag[1] );
			$gtm_ids  = array_unique( preg_grep( '/^GTM-/', $gtm[0] ) );
			$loads    = count( $gtag[0] );
			$plugins  = Environment::tracking_plugins();
			$detail   = sprintf(
				/* translators: 1: gtag-ID's, 2: GTM-ID's, 3: plugins */
				__( 'gtag: %1$s · GTM: %2$s · plugins: %3$s', 'clean-seo-ads-ai' ),
				$gtag_ids ? implode( ', ', $gtag_ids ) : '—',
				$gtm_ids ? implode( ', ', $gtm_ids ) : '—',
				$plugins ? implode( ', ', $plugins ) : '—'
			);
			if ( $loads > 1 || count( $gtm_ids ) > 1 || ( $gtag_ids && $gtm_ids && count( $plugins ) > 1 ) ) {
				$rows[] = self::row( $t, __( 'Dubbele tracking', 'clean-seo-ads-ai' ), 'warning', $detail, __( 'De Google-tag lijkt meerdere keren te laden. Laat één bron (Site Kit óf GTM óf het thema) de tags plaatsen; dubbele tags tellen bezoeken en conversies dubbel.', 'clean-seo-ads-ai' ) );
			} elseif ( $gtag_ids || $gtm_ids ) {
				$rows[] = self::row( $t, __( 'Google-tags', 'clean-seo-ads-ai' ), 'ok', $detail );
			} else {
				$rows[] = self::row( $t, __( 'Google-tags', 'clean-seo-ads-ai' ), 'info', __( 'Geen Google-tag op de homepage gevonden. Conversies worden alleen intern geteld.', 'clean-seo-ads-ai' ), __( 'Plaats GA4/Google Ads via Site Kit of GTM als u conversies in Google wilt zien.', 'clean-seo-ads-ai' ) );
			}
			$consent_mode = (bool) preg_match( "/gtag\(\s*['\"]consent['\"]\s*,\s*['\"]default['\"]/", $html ) || false !== strpos( $html, 'consent_mode' ) || false !== stripos( $html, 'ad_user_data' );
			$cmp          = Environment::consent_plugins();
			if ( ( $gtag_ids || $gtm_ids ) && ! $consent_mode && ! $cmp ) {
				$rows[] = self::row( $t, __( 'Toestemming (AVG)', 'clean-seo-ads-ai' ), 'warning', __( 'Google-tags gevonden, maar geen consentoplossing of Consent Mode gedetecteerd.', 'clean-seo-ads-ai' ), __( 'Gebruik een cookiebanner met Google Consent Mode v2 (bijv. Complianz of CookieYes).', 'clean-seo-ads-ai' ) );
			} else {
				$rows[] = self::row( $t, __( 'Toestemming (AVG)', 'clean-seo-ads-ai' ), 'ok', implode( ', ', array_filter( array_merge( $cmp, $consent_mode ? array( 'Consent Mode' ) : array() ) ) ) );
			}
			$rows[] = self::row( $t, __( 'Leadmeting door deze plugin', 'clean-seo-ads-ai' ), Settings::get( 'tracking_enabled' ) ? 'ok' : 'info', Settings::get( 'tracking_enabled' ) ? __( 'Actief: cookieloos, zonder persoonsgegevens, plaatst geen eigen Google-tag.', 'clean-seo-ads-ai' ) : __( 'Uitgeschakeld.', 'clean-seo-ads-ai' ) );
		}

		$counts = array(
			'ok'      => 0,
			'warning' => 0,
			'error'   => 0,
			'info'    => 0,
		);
		foreach ( $rows as $r ) {
			++$counts[ $r['status'] ];
		}
		return array(
			'rows'    => $rows,
			'counts'  => $counts,
			'env'     => Environment::summary(),
			'checked' => time(),
		);
	}

	/**
	 * Blokkeert robots.txt alles voor User-agent: * ?
	 *
	 * @param string $body Inhoud van robots.txt.
	 * @return bool
	 */
	public static function robots_blocks_all( $body ) {
		$star     = false;
		$in_agent = false;
		foreach ( preg_split( '/\R/', (string) $body ) as $line ) {
			$line = trim( preg_replace( '/#.*/', '', $line ) );
			if ( '' === $line || false === strpos( $line, ':' ) ) {
				continue;
			}
			list( $key, $value ) = array_map( 'trim', explode( ':', $line, 2 ) );
			$key                 = strtolower( $key );
			if ( 'user-agent' === $key ) {
				$star     = $in_agent ? ( $star || '*' === $value ) : '*' === $value;
				$in_agent = true;
				continue;
			}
			$in_agent = false;
			if ( $star && 'disallow' === $key && '/' === $value ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * URL's uit een sitemap (of sitemapindex, max. 15 subsitemaps).
	 *
	 * @param string $url   Sitemap-URL.
	 * @param int    $depth Recursiediepte.
	 * @return string[]|null Null als ongeldig.
	 */
	public static function sitemap_urls( $url, $depth = 0 ) {
		$res = self::get( $url );
		if ( 200 !== $res['status'] || false === strpos( $res['body'], '<' ) ) {
			return null;
		}
		$prev = libxml_use_internal_errors( true );
		$xml  = simplexml_load_string( $res['body'], 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA );
		libxml_clear_errors();
		libxml_use_internal_errors( $prev );
		if ( ! $xml ) {
			return null;
		}
		$name = $xml->getName();
		if ( 'urlset' !== $name && 'sitemapindex' !== $name ) {
			return null;
		}
		$out = array();
		if ( 'sitemapindex' === $name && $depth < 1 ) {
			$i = 0;
			foreach ( $xml->sitemap as $sm ) {
				$child = self::sitemap_urls( (string) $sm->loc, $depth + 1 );
				if ( $child ) {
					$out = array_merge( $out, $child );
				}
				if ( ++$i >= 15 ) {
					break;
				}
			}
		} else {
			foreach ( $xml->url as $u ) {
				$out[] = untrailingslashit( (string) $u->loc );
				if ( count( $out ) > 5000 ) {
					break;
				}
			}
		}
		return $out;
	}

	/**
	 * Laatst opgehaalde sitemap-URL's (of null).
	 *
	 * @return string[]|null
	 */
	public static function cached_sitemap_urls() {
		$urls = get_transient( 'csaam_sitemap_urls' );
		return is_array( $urls ) ? $urls : null;
	}
}
