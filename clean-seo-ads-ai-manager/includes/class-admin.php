<?php
/**
 * Beheerschermen, menu's, assets, formulierverwerking en UI-helpers.
 *
 * @package CSAAM
 */

namespace CSAAM;

use CSAAM\Integrations\Google_OAuth;
use CSAAM\Modules\AI_Optimizer;
use CSAAM\Modules\Reports;

defined( 'ABSPATH' ) || exit;

/**
 * Admin.
 */
class Admin {

	/**
	 * Menu: slug => [label, view].
	 *
	 * @return array<string,array{0:string,1:string}>
	 */
	public static function pages() {
		return array(
			'csaam'             => array( __( 'Dashboard', 'clean-seo-ads-ai' ), 'dashboard' ),
			'csaam-seo'         => array( __( 'SEO Analyse', 'clean-seo-ads-ai' ), 'seo' ),
			'csaam-keywords'    => array( __( 'Zoekwoorden', 'clean-seo-ads-ai' ), 'keywords' ),
			'csaam-local'       => array( __( 'Lokale SEO', 'clean-seo-ads-ai' ), 'local' ),
			'csaam-ai'          => array( __( 'AI Optimalisatie', 'clean-seo-ads-ai' ), 'ai' ),
			'csaam-ads'         => array( __( 'Google Ads', 'clean-seo-ads-ai' ), 'ads' ),
			'csaam-gsc'         => array( __( 'Google Search Console', 'clean-seo-ads-ai' ), 'gsc' ),
			'csaam-ga4'         => array( __( 'Google Analytics', 'clean-seo-ads-ai' ), 'ga4' ),
			'csaam-conversions' => array( __( 'Conversies en Leads', 'clean-seo-ads-ai' ), 'conversions' ),
			'csaam-technical'   => array( __( 'Technische Controle', 'clean-seo-ads-ai' ), 'technical' ),
			'csaam-reports'     => array( __( 'Rapportages', 'clean-seo-ads-ai' ), 'reports' ),
			'csaam-settings'    => array( __( 'Instellingen', 'clean-seo-ads-ai' ), 'settings' ),
		);
	}

	/**
	 * Hooks.
	 */
	public static function register() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'admin_post_csaam_save_settings', array( __CLASS__, 'save_settings' ) );
		add_action( 'admin_post_csaam_export_csv', array( __CLASS__, 'export_csv' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( CSAAM_FILE ), array( __CLASS__, 'action_links' ) );
	}

	/**
	 * Link naar instellingen in de pluginlijst.
	 *
	 * @param array $links Links.
	 * @return array
	 */
	public static function action_links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=csaam-settings' ) ) . '">' . esc_html__( 'Instellingen', 'clean-seo-ads-ai' ) . '</a>' );
		return $links;
	}

	/**
	 * Menu's.
	 */
	public static function menu() {
		$pages = self::pages();
		add_menu_page(
			__( 'Clean SEO & Ads AI', 'clean-seo-ads-ai' ),
			__( 'Clean SEO & Ads AI', 'clean-seo-ads-ai' ),
			CSAAM_CAP,
			'csaam',
			array( __CLASS__, 'render' ),
			'dashicons-chart-area',
			3
		);
		foreach ( $pages as $slug => $page ) {
			add_submenu_page( 'csaam', $page[0] . ' — Clean SEO & Ads AI', $page[0], CSAAM_CAP, $slug, array( __CLASS__, 'render' ) );
		}
	}

	/**
	 * Is dit een pluginscherm?
	 *
	 * @return string|null Slug.
	 */
	private static function current_slug() {
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return isset( self::pages()[ $page ] ) ? $page : null;
	}

	/**
	 * CSS en JS alleen op eigen schermen.
	 */
	public static function assets() {
		$slug = self::current_slug();
		if ( ! $slug ) {
			return;
		}
		wp_enqueue_style( 'csaam-admin', CSAAM_URL . 'assets/css/admin.css', array(), CSAAM_VERSION );
		wp_enqueue_script( 'csaam-admin', CSAAM_URL . 'assets/js/admin.js', array( 'wp-api-fetch' ), CSAAM_VERSION, true );
		wp_localize_script(
			'csaam-admin',
			'csaamAdmin',
			array(
				'ns'   => 'csaam/v1',
				'page' => $slug,
				'i18n' => array(
					'scanning'     => __( 'Bezig met scannen…', 'clean-seo-ads-ai' ),
					'scanDone'     => __( 'Scan voltooid. De pagina wordt vernieuwd.', 'clean-seo-ads-ai' ),
					'working'      => __( 'Bezig…', 'clean-seo-ads-ai' ),
					'aiWorking'    => __( 'Claude analyseert de pagina. Dit kan tot een minuut duren…', 'clean-seo-ads-ai' ),
					'error'        => __( 'Er ging iets mis.', 'clean-seo-ads-ai' ),
					'confirm'      => __( 'Weet u zeker dat u dit voorstel wilt goedkeuren en toepassen?', 'clean-seo-ads-ai' ),
					'confirmDraft' => __( 'Er wordt een conceptversie aangemaakt; de live pagina blijft ongewijzigd. Doorgaan?', 'clean-seo-ads-ai' ),
					'rejected'     => __( 'Afgewezen.', 'clean-seo-ads-ai' ),
					'openDraft'    => __( 'Concept openen', 'clean-seo-ads-ai' ),
					'loading'      => __( 'Laden…', 'clean-seo-ads-ai' ),
				),
			)
		);
	}

	/**
	 * Rendert het gevraagde scherm.
	 */
	public static function render() {
		if ( ! current_user_can( CSAAM_CAP ) ) {
			wp_die( esc_html__( 'Geen toegang.', 'clean-seo-ads-ai' ), 403 );
		}
		$slug = self::current_slug();
		$view = $slug ? self::pages()[ $slug ][1] : 'dashboard';
		$days = self::days();
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$refresh = isset( $_GET['refresh'], $_GET['_csaam'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_csaam'] ) ), 'csaam_refresh' );

		echo '<div class="wrap csaam">';
		self::nav( $slug );
		self::notices();
		include CSAAM_DIR . 'admin/views/' . $view . '.php';
		echo '</div>';
	}

	/**
	 * Gekozen periode.
	 *
	 * @return int
	 */
	public static function days() {
		$days = isset( $_GET['days'] ) ? absint( $_GET['days'] ) : 28; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return in_array( $days, array( 7, 28, 90 ), true ) ? $days : 28;
	}

	/**
	 * Navigatiebalk met merk.
	 *
	 * @param string|null $current Huidige slug.
	 */
	private static function nav( $current ) {
		echo '<header class="csaam-top"><div class="csaam-brand"><span class="csaam-logo" aria-hidden="true">C</span><div><strong>' . esc_html__( 'Clean SEO & Ads AI', 'clean-seo-ads-ai' ) . '</strong><small>' . esc_html( Settings::get( 'company_name' ) ) . '</small></div></div>';
		echo '<nav class="csaam-nav" aria-label="' . esc_attr__( 'Plugin-navigatie', 'clean-seo-ads-ai' ) . '">';
		foreach ( self::pages() as $slug => $page ) {
			printf(
				'<a href="%s"%s>%s</a>',
				esc_url( admin_url( 'admin.php?page=' . $slug ) ),
				$slug === $current ? ' class="is-active" aria-current="page"' : '',
				esc_html( $page[0] )
			);
		}
		echo '</nav></header>';
		if ( Settings::demo() ) {
			echo '<div class="csaam-demo" role="status"><strong>' . esc_html__( 'DEMOMODUS', 'clean-seo-ads-ai' ) . '</strong> — ' . esc_html__( 'Google-cijfers op deze schermen zijn voorbeeldgegevens en geen echte resultaten. Zet de demomodus uit bij Instellingen.', 'clean-seo-ads-ai' ) . '</div>';
		}
	}

	/**
	 * Eenmalige meldingen.
	 */
	private static function notices() {
		$key    = 'csaam_notice_' . get_current_user_id();
		$notice = get_transient( $key );
		if ( $notice ) {
			delete_transient( $key );
			printf( '<div class="notice notice-%s is-dismissible"><p>%s</p></div>', 'success' === $notice['type'] ? 'success' : 'error', esc_html( $notice['message'] ) );
		}
	}

	/**
	 * Paginakop met periodekeuze en vernieuwknop.
	 *
	 * @param string $title    Titel.
	 * @param string $intro    Toelichting.
	 * @param bool   $periods  Periodekeuze tonen.
	 * @param bool   $refresh  Vernieuwknop tonen.
	 */
	public static function heading( $title, $intro = '', $periods = false, $refresh = false ) {
		$slug = self::current_slug();
		echo '<div class="csaam-head"><div><h1>' . esc_html( $title ) . '</h1>';
		if ( $intro ) {
			echo '<p class="csaam-intro">' . esc_html( $intro ) . '</p>';
		}
		echo '</div><div class="csaam-head-actions">';
		if ( $periods ) {
			echo '<div class="csaam-periods" role="group" aria-label="' . esc_attr__( 'Periode', 'clean-seo-ads-ai' ) . '">';
			foreach ( array( 7, 28, 90 ) as $d ) {
				printf(
					'<a href="%s" class="%s">%s</a>',
					esc_url( admin_url( 'admin.php?page=' . $slug . '&days=' . $d ) ),
					self::days() === $d ? 'is-active' : '',
					/* translators: %d: dagen */
					esc_html( sprintf( __( '%d dagen', 'clean-seo-ads-ai' ), $d ) )
				);
			}
			echo '</div>';
		}
		if ( $refresh ) {
			printf(
				'<a class="button" href="%s">%s</a>',
				esc_url( wp_nonce_url( admin_url( 'admin.php?page=' . $slug . '&days=' . self::days() . '&refresh=1' ), 'csaam_refresh', '_csaam' ) ),
				esc_html__( 'Gegevens vernieuwen', 'clean-seo-ads-ai' )
			);
		}
		echo '</div></div>';
	}

	/**
	 * KPI-tegel.
	 *
	 * @param string     $label Label.
	 * @param string     $value Waarde (al geformatteerd).
	 * @param float|null $delta Verandering in %.
	 * @param string     $hint  Toelichting.
	 * @param bool       $lower_is_better Bijv. kosten per lead.
	 */
	public static function tile( $label, $value, $delta = null, $hint = '', $lower_is_better = false ) {
		echo '<div class="csaam-tile"><span class="csaam-tile-label">' . esc_html( $label ) . '</span><span class="csaam-tile-value">' . esc_html( $value ) . '</span>';
		if ( null !== $delta ) {
			$good  = $lower_is_better ? $delta < 0 : $delta > 0;
			$class = 0.0 === (float) $delta ? 'flat' : ( $good ? 'up' : 'down' );
			$arrow = $delta > 0 ? '▲' : ( $delta < 0 ? '▼' : '■' );
			/* translators: %s: verandering */
			echo '<span class="csaam-delta is-' . esc_attr( $class ) . '"><span aria-hidden="true">' . esc_html( $arrow ) . '</span> ' . esc_html( sprintf( __( '%s%% t.o.v. vorige periode', 'clean-seo-ads-ai' ), number_format_i18n( abs( $delta ), 1 ) ) ) . '</span>';
		}
		if ( $hint ) {
			echo '<span class="csaam-tile-hint">' . esc_html( $hint ) . '</span>';
		}
		echo '</div>';
	}

	/**
	 * Status-label met icoon (nooit alleen kleur).
	 *
	 * @param string $status ok|good|notice|info|warning|improve|error|missing.
	 * @param string $label  Tekst (optioneel).
	 */
	public static function badge( $status, $label = '' ) {
		$map = array(
			'ok'      => array( 'good', '✓', __( 'In orde', 'clean-seo-ads-ai' ) ),
			'good'    => array( 'good', '✓', __( 'Goed', 'clean-seo-ads-ai' ) ),
			'info'    => array( 'info', 'i', __( 'Info', 'clean-seo-ads-ai' ) ),
			'notice'  => array( 'info', 'i', __( 'Kans', 'clean-seo-ads-ai' ) ),
			'warning' => array( 'warning', '!', __( 'Waarschuwing', 'clean-seo-ads-ai' ) ),
			'improve' => array( 'warning', '!', __( 'Verbeteren', 'clean-seo-ads-ai' ) ),
			'error'   => array( 'critical', '×', __( 'Fout', 'clean-seo-ads-ai' ) ),
			'missing' => array( 'muted', '–', __( 'Ontbreekt', 'clean-seo-ads-ai' ) ),
		);
		$m   = isset( $map[ $status ] ) ? $map[ $status ] : $map['info'];
		echo '<span class="csaam-badge is-' . esc_attr( $m[0] ) . '"><span aria-hidden="true">' . esc_html( $m[1] ) . '</span> ' . esc_html( $label ? $label : $m[2] ) . '</span>';
	}

	/**
	 * Score-ring/label.
	 *
	 * @param int $score 0–100.
	 */
	public static function score( $score ) {
		$status = $score >= 80 ? 'good' : ( $score >= 50 ? 'warning' : 'critical' );
		echo '<span class="csaam-score is-' . esc_attr( $status ) . '">' . esc_html( (string) (int) $score ) . '</span>';
	}

	/**
	 * Lege/foutstatus met link naar instellingen.
	 *
	 * @param \WP_Error $error Fout.
	 */
	public static function empty_state( $error ) {
		echo '<div class="csaam-empty"><p>' . esc_html( $error->get_error_message() ) . '</p>';
		if ( in_array( $error->get_error_code(), array( 'csaam_not_configured', 'csaam_not_connected', 'csaam_token_revoked', 'csaam_ai_key' ), true ) ) {
			echo '<p><a class="button button-primary" href="' . esc_url( admin_url( 'admin.php?page=csaam-settings#google' ) ) . '">' . esc_html__( 'Naar instellingen', 'clean-seo-ads-ai' ) . '</a> ';
			echo '<span class="csaam-muted">' . esc_html__( 'Of zet de demomodus aan om het scherm met duidelijk gemarkeerde voorbeeldgegevens te bekijken.', 'clean-seo-ads-ai' ) . '</span></p>';
		}
		echo '</div>';
	}

	/**
	 * Lijngrafiek (één reeks, één as) als inline SVG met tooltips per punt.
	 *
	 * @param array  $points  Lijst [label, waarde].
	 * @param string $title   Titel (benoemt de reeks).
	 * @param string $unit    Eenheid voor tooltips (bijv. '€').
	 * @param bool   $bars    Staafdiagram in plaats van lijn.
	 */
	public static function chart( array $points, $title, $unit = '', $bars = false ) {
		$w   = 480;
		$h   = 170;
		$pad = array( 8, 8, 22, 36 ); // boven, rechts, onder, links.
		$n   = count( $points );
		echo '<figure class="csaam-chart"><figcaption>' . esc_html( $title ) . '</figcaption>';
		if ( $n < 2 ) {
			echo '<p class="csaam-muted">' . esc_html__( 'Nog niet genoeg gegevens voor een grafiek.', 'clean-seo-ads-ai' ) . '</p></figure>';
			return;
		}
		$values = array_map( 'floatval', wp_list_pluck( $points, 1 ) );
		$max    = max( $values );
		$max    = $max > 0 ? $max * 1.1 : 1;
		$iw     = $w - $pad[1] - $pad[3];
		$ih     = $h - $pad[0] - $pad[2];
		$x      = static function ( $i ) use ( $n, $iw, $pad, $bars ) {
			return $bars ? $pad[3] + ( $i + 0.5 ) * $iw / $n : $pad[3] + $i * $iw / ( $n - 1 );
		};
		$y      = static function ( $v ) use ( $max, $ih, $pad ) {
			return $pad[0] + $ih - ( $v / $max ) * $ih;
		};
		$fmt    = static function ( $v ) use ( $unit ) {
			$num = number_format_i18n( $v, floor( $v ) == $v ? 0 : 2 ); // phpcs:ignore Universal.Operators.StrictComparisons.LooseEqual
			return '€' === $unit ? '€ ' . $num : $num . ( $unit ? ' ' . $unit : '' );
		};

		printf( '<svg viewBox="0 0 %1$d %2$d" role="img" aria-label="%3$s">', (int) $w, (int) $h, esc_attr( $title ) );
		// Rasterlijnen (recessief) en y-labels.
		foreach ( array( 0, 0.5, 1 ) as $f ) {
			$gy = $pad[0] + $ih - $f * $ih;
			printf( '<line class="grid" x1="%1$s" x2="%2$s" y1="%3$s" y2="%3$s" />', esc_attr( (string) $pad[3] ), esc_attr( (string) ( $w - $pad[1] ) ), esc_attr( (string) round( $gy, 1 ) ) );
			printf( '<text class="axis" x="%1$s" y="%2$s" text-anchor="end">%3$s</text>', esc_attr( (string) ( $pad[3] - 6 ) ), esc_attr( (string) round( $gy + 4, 1 ) ), esc_html( number_format_i18n( $max / 1.1 * $f * 1.1, 0 ) ) );
		}
		if ( $bars ) {
			$bw = max( 2, $iw / $n - 2 );
			foreach ( $points as $i => $p ) {
				$top = $y( (float) $p[1] );
				printf(
					'<g class="pt"><rect class="bar" x="%1$s" y="%2$s" width="%3$s" height="%4$s" rx="2"/><rect class="hit" x="%5$s" y="%6$s" width="%7$s" height="%8$s"><title>%9$s</title></rect></g>',
					esc_attr( (string) round( $x( $i ) - $bw / 2, 1 ) ),
					esc_attr( (string) round( $top, 1 ) ),
					esc_attr( (string) round( $bw, 1 ) ),
					esc_attr( (string) round( $pad[0] + $ih - $top, 1 ) ),
					esc_attr( (string) round( $x( $i ) - $iw / $n / 2, 1 ) ),
					esc_attr( (string) $pad[0] ),
					esc_attr( (string) round( $iw / $n, 1 ) ),
					esc_attr( (string) $ih ),
					esc_html( $p[0] . ': ' . $fmt( (float) $p[1] ) )
				);
			}
		} else {
			$d = '';
			foreach ( $points as $i => $p ) {
				$d .= ( $i ? 'L' : 'M' ) . round( $x( $i ), 1 ) . ' ' . round( $y( (float) $p[1] ), 1 );
			}
			$area = $d . 'L' . round( $x( $n - 1 ), 1 ) . ' ' . ( $pad[0] + $ih ) . 'L' . $pad[3] . ' ' . ( $pad[0] + $ih ) . 'Z';
			printf( '<path class="area" d="%s"/><path class="line" d="%s"/>', esc_attr( $area ), esc_attr( $d ) );
			$step = $iw / max( 1, $n - 1 );
			foreach ( $points as $i => $p ) {
				printf(
					'<g class="pt"><rect class="hit" x="%1$s" y="%2$s" width="%3$s" height="%4$s"/><circle class="dot" cx="%5$s" cy="%6$s" r="4"/><title>%7$s</title></g>',
					esc_attr( (string) round( $x( $i ) - $step / 2, 1 ) ),
					esc_attr( (string) $pad[0] ),
					esc_attr( (string) round( $step, 1 ) ),
					esc_attr( (string) $ih ),
					esc_attr( (string) round( $x( $i ), 1 ) ),
					esc_attr( (string) round( $y( (float) $p[1] ), 1 ) ),
					esc_html( $p[0] . ': ' . $fmt( (float) $p[1] ) )
				);
			}
		}
		// X-labels: eerste, midden, laatste.
		foreach ( array_unique( array( 0, (int) floor( ( $n - 1 ) / 2 ), $n - 1 ) ) as $i ) {
			printf( '<text class="axis" x="%1$s" y="%2$s" text-anchor="middle">%3$s</text>', esc_attr( (string) round( $x( $i ), 1 ) ), esc_attr( (string) ( $h - 4 ) ), esc_html( self::short_date( $points[ $i ][0] ) ) );
		}
		echo '</svg>';
		echo '<details class="csaam-table-view"><summary>' . esc_html__( 'Toon als tabel', 'clean-seo-ads-ai' ) . '</summary><table class="widefat striped"><tbody>';
		foreach ( $points as $p ) {
			echo '<tr><td>' . esc_html( $p[0] ) . '</td><td>' . esc_html( $fmt( (float) $p[1] ) ) . '</td></tr>';
		}
		echo '</tbody></table></details></figure>';
	}

	/**
	 * Korte datum (dd-mm) als het een datum is.
	 *
	 * @param string $label Label.
	 * @return string
	 */
	private static function short_date( $label ) {
		return preg_match( '/^\d{4}-(\d{2})-(\d{2})$/', $label, $m ) ? $m[2] . '-' . $m[1] : $label;
	}

	/**
	 * Getal.
	 *
	 * @param mixed $n        Getal.
	 * @param int   $decimals Decimalen.
	 * @return string
	 */
	public static function num( $n, $decimals = 0 ) {
		return null === $n ? '—' : number_format_i18n( (float) $n, $decimals );
	}

	/**
	 * Bedrag.
	 *
	 * @param mixed $n Bedrag.
	 * @return string
	 */
	public static function money( $n ) {
		return null === $n ? '—' : '€ ' . number_format_i18n( (float) $n, 2 );
	}

	/**
	 * Verwerkt het instellingenformulier.
	 */
	public static function save_settings() {
		if ( ! current_user_can( CSAAM_CAP ) ) {
			wp_die( esc_html__( 'Geen toegang.', 'clean-seo-ads-ai' ), 403 );
		}
		check_admin_referer( 'csaam_save_settings' );
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- per veld gesanitized in Settings::save().
		$input = isset( $_POST['csaam'] ) && is_array( $_POST['csaam'] ) ? wp_unslash( $_POST['csaam'] ) : array();
		Settings::save( $input );

		// Geheimen: alleen bijwerken als er iets is ingevuld of verwijderen is aangevinkt.
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$secrets = isset( $_POST['csaam_secret'] ) && is_array( $_POST['csaam_secret'] ) ? wp_unslash( $_POST['csaam_secret'] ) : array();
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$remove = isset( $_POST['csaam_secret_remove'] ) && is_array( $_POST['csaam_secret_remove'] ) ? wp_unslash( $_POST['csaam_secret_remove'] ) : array();
		foreach ( array_keys( Settings::SECRET_CONSTANTS ) as $name ) {
			if ( ! empty( $remove[ $name ] ) ) {
				Settings::set_secret( $name, '' );
			} elseif ( isset( $secrets[ $name ] ) && '' !== trim( (string) $secrets[ $name ] ) ) {
				Settings::set_secret( $name, sanitize_text_field( (string) $secrets[ $name ] ) );
			}
		}
		delete_transient( 'csaam_form_types' );
		Logger::info( 'settings', 'Instellingen opgeslagen', array( 'user' => get_current_user_id() ) );

		set_transient(
			'csaam_notice_' . get_current_user_id(),
			array(
				'type'    => 'success',
				'message' => __( 'Instellingen opgeslagen.', 'clean-seo-ads-ai' ),
			),
			60
		);
		$tab = isset( $_POST['csaam_tab'] ) ? sanitize_key( wp_unslash( $_POST['csaam_tab'] ) ) : '';
		wp_safe_redirect( admin_url( 'admin.php?page=csaam-settings' . ( $tab ? '#' . $tab : '' ) ) );
		exit;
	}

	/**
	 * CSV-export.
	 */
	public static function export_csv() {
		if ( ! current_user_can( CSAAM_CAP ) ) {
			wp_die( esc_html__( 'Geen toegang.', 'clean-seo-ads-ai' ), 403 );
		}
		check_admin_referer( 'csaam_export_csv' );
		$days = isset( $_GET['days'] ) ? absint( $_GET['days'] ) : 28;
		Reports::download_csv( in_array( $days, array( 7, 28, 90 ), true ) ? $days : 28 );
	}

	/**
	 * Aantal openstaande AI-voorstellen.
	 *
	 * @return int
	 */
	public static function pending_count() {
		return count( AI_Optimizer::all( 'pending' ) );
	}

	/**
	 * Status van de Google-koppeling (voor views).
	 *
	 * @return array
	 */
	public static function google_status() {
		return Google_OAuth::status();
	}
}
