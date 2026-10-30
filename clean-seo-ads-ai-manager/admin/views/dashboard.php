<?php
/**
 * Dashboard.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Environment;
use CSAAM\Integrations\Analytics;
use CSAAM\Integrations\Google_Ads;
use CSAAM\Integrations\Search_Console;
use CSAAM\Modules\AI_Optimizer;
use CSAAM\Modules\Conversions;
use CSAAM\Modules\Seo_Audit;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

$audit   = Seo_Audit::results();
$gsc     = Search_Console::overview( $days, $refresh );
$ga4     = Analytics::overview( $days, $refresh );
$ads     = Google_Ads::overview( $days, $refresh );
$leads   = Conversions::overview( $days );
$usage   = AI_Optimizer::usage();
$pending = AI_Optimizer::all( 'pending' );

$lead_total = $leads['totals']['quote_form'] + $leads['totals']['contact'] + $leads['totals']['phone'] + $leads['totals']['email'] + $leads['totals']['whatsapp'];

Admin::heading( __( 'Dashboard', 'clean-seo-ads-ai' ), __( 'Vindbaarheid, advertenties en offerteaanvragen in één overzicht. Alleen echte gegevens uit gekoppelde accounts — tenzij de demomodus aan staat.', 'clean-seo-ads-ai' ), true, true );
?>
<section class="csaam-tiles" aria-label="<?php esc_attr_e( 'Kerncijfers', 'clean-seo-ads-ai' ); ?>">
	<?php
	Admin::tile( __( 'Gem. SEO-score', 'clean-seo-ads-ai' ), $audit['summary']['pages'] ? $audit['summary']['avg'] . '/100' : '—', null, $audit['summary']['pages'] ? sprintf( /* translators: %d: aantal */ _n( '%d pagina gescand', '%d pagina\'s gescand', $audit['summary']['pages'], 'clean-seo-ads-ai' ), $audit['summary']['pages'] ) : __( 'Nog geen scan uitgevoerd', 'clean-seo-ads-ai' ) );
	Admin::tile( __( 'Leads (eigen meting)', 'clean-seo-ads-ai' ), Admin::num( $lead_total ), null, sprintf( /* translators: %d: aantal */ __( 'waarvan %d offerteaanvragen', 'clean-seo-ads-ai' ), $leads['totals']['quote_form'] ) );
	if ( ! is_wp_error( $gsc ) ) {
		$prev = $gsc['previous'];
		Admin::tile( __( 'Klikken uit Google (organisch)', 'clean-seo-ads-ai' ), Admin::num( $gsc['totals']['clicks'] ), $prev && $prev['clicks'] ? round( ( $gsc['totals']['clicks'] - $prev['clicks'] ) / $prev['clicks'] * 100, 1 ) : null );
	} else {
		Admin::tile( __( 'Klikken uit Google (organisch)', 'clean-seo-ads-ai' ), '—', null, __( 'Search Console niet gekoppeld', 'clean-seo-ads-ai' ) );
	}
	if ( ! is_wp_error( $ga4 ) ) {
		$prev = $ga4['previous'];
		$sess = isset( $ga4['totals']['sessions'] ) ? $ga4['totals']['sessions'] : 0;
		Admin::tile( __( 'Websitesessies (GA4)', 'clean-seo-ads-ai' ), Admin::num( $sess ), $prev && $prev['sessions'] ? round( ( $sess - $prev['sessions'] ) / $prev['sessions'] * 100, 1 ) : null );
	} else {
		Admin::tile( __( 'Websitesessies (GA4)', 'clean-seo-ads-ai' ), '—', null, __( 'GA4 niet gekoppeld', 'clean-seo-ads-ai' ) );
	}
	if ( ! is_wp_error( $ads ) ) {
		Admin::tile( __( 'Google Ads-kosten', 'clean-seo-ads-ai' ), Admin::money( $ads['totals']['cost'] ), null, sprintf( /* translators: %s: conversies */ __( '%s conversies in Google Ads', 'clean-seo-ads-ai' ), Admin::num( $ads['totals']['conversions'], 1 ) ) );
		Admin::tile( __( 'Ads-kosten per lead', 'clean-seo-ads-ai' ), $lead_total ? Admin::money( $ads['totals']['cost'] / $lead_total ) : '—', null, __( 'Ads-kosten ÷ alle eigen gemeten leads (indicatief)', 'clean-seo-ads-ai' ) );
	} else {
		Admin::tile( __( 'Google Ads-kosten', 'clean-seo-ads-ai' ), '—', null, __( 'Google Ads niet gekoppeld', 'clean-seo-ads-ai' ) );
	}
	Admin::tile( __( 'AI-kosten deze maand', 'clean-seo-ads-ai' ), '$ ' . number_format_i18n( $usage['cost'], 2 ), null, sprintf( /* translators: %s: budget */ __( 'budget $ %s', 'clean-seo-ads-ai' ), number_format_i18n( $usage['budget'], 2 ) ) );
	?>
</section>

<div class="csaam-grid">
	<div class="csaam-card">
		<?php
		if ( ! is_wp_error( $gsc ) ) {
			$points = array();
			foreach ( $gsc['daily'] as $d ) {
				$points[] = array( $d['date'], $d['clicks'] );
			}
			Admin::chart( $points, __( 'Klikken uit Google Zoeken per dag', 'clean-seo-ads-ai' ) );
		} else {
			echo '<h2>' . esc_html__( 'Google Zoeken', 'clean-seo-ads-ai' ) . '</h2>';
			Admin::empty_state( $gsc );
		}
		?>
	</div>
	<div class="csaam-card">
		<?php
		$points = array();
		foreach ( $leads['daily'] as $d ) {
			$points[] = array( $d['date'], $d['quote_form'] + $d['contact'] + $d['phone'] + $d['email'] + $d['whatsapp'] );
		}
		Admin::chart( $points, __( 'Leads per dag (formulieren + klikken)', 'clean-seo-ads-ai' ), '', true );
		?>
	</div>
	<?php if ( ! is_wp_error( $ads ) ) : ?>
	<div class="csaam-card">
		<?php
		$points = array();
		foreach ( $ads['daily'] as $d ) {
			$points[] = array( $d['date'], $d['cost'] );
		}
		Admin::chart( $points, __( 'Google Ads-kosten per dag', 'clean-seo-ads-ai' ), '€' );
		?>
	</div>
	<?php endif; ?>
</div>

<div class="csaam-grid">
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Eerst aanpakken', 'clean-seo-ads-ai' ); ?></h2>
		<?php if ( ! $audit['pages'] ) : ?>
			<p><?php esc_html_e( 'Voer de eerste SEO-scan uit om verbeterpunten per pagina te zien.', 'clean-seo-ads-ai' ); ?></p>
			<p><a class="button button-primary" href="<?php echo esc_url( admin_url( 'admin.php?page=csaam-seo' ) ); ?>"><?php esc_html_e( 'Naar SEO Analyse', 'clean-seo-ads-ai' ); ?></a></p>
		<?php else : ?>
			<ul class="csaam-actions-list">
				<?php
				foreach ( array_slice( $audit['pages'], 0, 6 ) as $p ) :
					$top = null;
					foreach ( array( 'error', 'warning', 'notice' ) as $sev ) {
						foreach ( $p['issues'] as $issue ) {
							if ( $issue['severity'] === $sev ) {
								$top = $issue;
								break 2;
							}
						}
					}
					if ( ! $top ) {
						continue;
					}
					?>
					<li>
						<?php Admin::score( $p['score'] ); ?>
						<div><a href="<?php echo esc_url( admin_url( 'admin.php?page=csaam-seo&post=' . $p['post_id'] ) ); ?>"><strong><?php echo esc_html( $p['title'] ); ?></strong></a><br><span class="csaam-muted"><?php echo esc_html( $top['message'] ); ?></span></div>
					</li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Wacht op uw goedkeuring', 'clean-seo-ads-ai' ); ?></h2>
		<?php if ( ! $pending ) : ?>
			<p class="csaam-muted"><?php esc_html_e( 'Geen openstaande AI-voorstellen. De AI publiceert nooit iets zonder uw toestemming.', 'clean-seo-ads-ai' ); ?></p>
		<?php else : ?>
			<ul class="csaam-actions-list">
				<?php foreach ( array_slice( $pending, 0, 6 ) as $item ) : ?>
					<li><span class="csaam-badge is-info"><?php echo esc_html( $item['task_label'] ); ?></span>
						<div><a href="<?php echo esc_url( admin_url( 'admin.php?page=csaam-ai&proposal=' . $item['id'] ) ); ?>"><?php echo esc_html( $item['post_title'] ); ?></a></div></li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Omgeving', 'clean-seo-ads-ai' ); ?></h2>
		<?php $env = Environment::summary(); ?>
		<dl class="csaam-dl">
			<dt><?php esc_html_e( 'SEO-plugin', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $env['seo_plugins'] ? implode( ', ', $env['seo_plugins'] ) : __( 'Geen', 'clean-seo-ads-ai' ) ); ?></dd>
			<dt><?php esc_html_e( 'Tracking', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $env['tracking_plugins'] ? implode( ', ', $env['tracking_plugins'] ) : __( 'Geen trackingplugin', 'clean-seo-ads-ai' ) ); ?></dd>
			<dt><?php esc_html_e( 'Formulieren', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $env['form_plugins'] ? implode( ', ', $env['form_plugins'] ) : __( 'Geen formulierplugin gevonden', 'clean-seo-ads-ai' ) ); ?></dd>
			<dt><?php esc_html_e( 'Toestemming', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $env['consent_plugins'] ? implode( ', ', $env['consent_plugins'] ) : __( 'Geen consentplugin gevonden', 'clean-seo-ads-ai' ) ); ?></dd>
			<dt><?php esc_html_e( 'Thema', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $env['theme'] ); ?></dd>
		</dl>
		<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=csaam-technical' ) ); ?>"><?php esc_html_e( 'Volledige technische controle →', 'clean-seo-ads-ai' ); ?></a></p>
	</div>
</div>
<p class="csaam-footnote"><?php esc_html_e( 'Deze plugin geeft inzicht en voorstellen; posities in Google kunnen niet worden gegarandeerd.', 'clean-seo-ads-ai' ); ?></p>
