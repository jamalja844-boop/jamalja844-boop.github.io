<?php
/**
 * Google Ads (alleen-lezen).
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Integrations\Google_Ads;
use CSAAM\Modules\Conversions;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

Admin::heading( __( 'Google Ads', 'clean-seo-ads-ai' ), __( 'Alleen-lezen. Campagnes, advertenties, biedingen en budgetten worden nooit door deze plugin gewijzigd.', 'clean-seo-ads-ai' ), true, true );

$ads = Google_Ads::overview( $days, $refresh );
if ( is_wp_error( $ads ) ) {
	Admin::empty_state( $ads );
	return;
}
$leads      = Conversions::totals( $days );
$lead_total = $leads['quote_form'] + $leads['contact'] + $leads['phone'] + $leads['email'] + $leads['whatsapp'];
$status_nl  = array(
	'ENABLED' => __( 'Actief', 'clean-seo-ads-ai' ),
	'PAUSED'  => __( 'Gepauzeerd', 'clean-seo-ads-ai' ),
);
?>
<p class="csaam-muted">
	<?php
	/* translators: 1: account, 2: van, 3: tot */
	echo esc_html( sprintf( __( 'Account: %1$s · periode %2$s t/m %3$s', 'clean-seo-ads-ai' ), $ads['account']['name'], $ads['period'][0], $ads['period'][1] ) );
	?>
</p>
<section class="csaam-tiles">
	<?php
	Admin::tile( __( 'Kosten', 'clean-seo-ads-ai' ), Admin::money( $ads['totals']['cost'] ) );
	Admin::tile( __( 'Klikken', 'clean-seo-ads-ai' ), Admin::num( $ads['totals']['clicks'] ), null, sprintf( /* translators: %s: CTR */ __( 'CTR %s%%', 'clean-seo-ads-ai' ), Admin::num( $ads['totals']['ctr'], 2 ) ) );
	Admin::tile( __( 'Vertoningen', 'clean-seo-ads-ai' ), Admin::num( $ads['totals']['impressions'] ) );
	Admin::tile( __( 'Conversies', 'clean-seo-ads-ai' ), Admin::num( $ads['totals']['conversions'], 1 ) );
	Admin::tile( __( 'Kosten per conversie', 'clean-seo-ads-ai' ), Admin::money( $ads['totals']['cpa'] ) );
	Admin::tile( __( 'Kosten per eigen lead', 'clean-seo-ads-ai' ), $lead_total ? Admin::money( $ads['totals']['cost'] / $lead_total ) : '—', null, __( 'Indicatief: alle leads, niet alleen uit Ads', 'clean-seo-ads-ai' ) );
	?>
</section>

<div class="csaam-grid">
	<div class="csaam-card">
		<?php
		$points = array();
		foreach ( $ads['daily'] as $d ) {
			$points[] = array( $d['date'], $d['cost'] );
		}
		Admin::chart( $points, __( 'Kosten per dag', 'clean-seo-ads-ai' ), '€' );
		?>
	</div>
	<div class="csaam-card">
		<?php
		$points = array();
		foreach ( $ads['daily'] as $d ) {
			$points[] = array( $d['date'], $d['conversions'] );
		}
		Admin::chart( $points, __( 'Conversies per dag', 'clean-seo-ads-ai' ), '', true );
		?>
	</div>
</div>

<div class="csaam-card">
	<div class="csaam-detail-head"><h2><?php esc_html_e( 'Campagnes', 'clean-seo-ads-ai' ); ?></h2>
		<button type="button" class="button button-primary" data-csaam-ai="ads_review" data-post="0"><?php esc_html_e( 'AI-verbetervoorstellen', 'clean-seo-ads-ai' ); ?></button></div>
	<div class="csaam-result" role="status"></div>
	<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
		<thead><tr><th><?php esc_html_e( 'Campagne', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Status', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Dagbudget', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Kosten', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Klikken', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Vert.', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'CTR', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Conv.', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Kosten/conv.', 'clean-seo-ads-ai' ); ?></th></tr></thead>
		<tbody>
		<?php foreach ( $ads['campaigns'] as $c ) : ?>
			<tr>
				<td><strong><?php echo esc_html( $c['name'] ); ?></strong><br><span class="csaam-muted"><?php echo esc_html( $c['channel'] . ' · ' . $c['bidding'] ); ?></span></td>
				<td><?php echo esc_html( isset( $status_nl[ $c['status'] ] ) ? $status_nl[ $c['status'] ] : $c['status'] ); ?></td>
				<td><?php echo esc_html( Admin::money( $c['budget'] ) ); ?></td>
				<td><?php echo esc_html( Admin::money( $c['cost'] ) ); ?></td>
				<td><?php echo esc_html( Admin::num( $c['clicks'] ) ); ?></td>
				<td><?php echo esc_html( Admin::num( $c['impressions'] ) ); ?></td>
				<td><?php echo esc_html( Admin::num( $c['ctr'], 2 ) ); ?>%</td>
				<td><?php echo esc_html( Admin::num( $c['conversions'], 1 ) ); ?></td>
				<td><?php echo esc_html( Admin::money( $c['cpa'] ) ); ?></td>
			</tr>
		<?php endforeach; ?>
		</tbody>
	</table></div>
</div>

<div class="csaam-grid">
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Zoekwoorden', 'clean-seo-ads-ai' ); ?></h2>
		<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Zoekwoord', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Kwaliteit', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Kosten', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Klikken', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Conv.', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( array_slice( $ads['keywords'], 0, 50 ) as $k ) : ?>
				<tr>
					<td><?php echo esc_html( $k['keyword'] ); ?> <span class="csaam-muted"><?php echo esc_html( strtolower( $k['match'] ) ); ?></span></td>
					<td><?php echo esc_html( null === $k['quality'] ? '—' : $k['quality'] . '/10' ); ?></td>
					<td><?php echo esc_html( Admin::money( $k['cost'] ) ); ?></td>
					<td><?php echo esc_html( Admin::num( $k['clicks'] ) ); ?></td>
					<td><?php echo esc_html( Admin::num( $k['conversions'], 1 ) ); ?></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table></div>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Zoektermen', 'clean-seo-ads-ai' ); ?></h2>
		<p class="csaam-muted"><?php esc_html_e( 'Waar mensen werkelijk op zochten. Termen met kosten maar zonder conversies zijn kandidaten voor uitsluitingszoekwoorden (zelf toevoegen in Google Ads).', 'clean-seo-ads-ai' ); ?></p>
		<?php if ( ! $ads['terms'] ) : ?>
			<p class="csaam-muted"><?php esc_html_e( 'Geen zoektermgegevens beschikbaar voor deze periode.', 'clean-seo-ads-ai' ); ?></p>
		<?php else : ?>
		<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Zoekterm', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Kosten', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Klikken', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Conv.', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( array_slice( $ads['terms'], 0, 50 ) as $t ) : ?>
				<tr class="<?php echo $t['cost'] > 0 && ! $t['conversions'] ? 'csaam-flag' : ''; ?>">
					<td><?php echo esc_html( $t['term'] ); ?><?php echo $t['cost'] > 0 && ! $t['conversions'] ? ' <span class="csaam-badge is-warning"><span aria-hidden="true">!</span> ' . esc_html__( 'geen conversie', 'clean-seo-ads-ai' ) . '</span>' : ''; ?></td>
					<td><?php echo esc_html( Admin::money( $t['cost'] ) ); ?></td>
					<td><?php echo esc_html( Admin::num( $t['clicks'] ) ); ?></td>
					<td><?php echo esc_html( Admin::num( $t['conversions'], 1 ) ); ?></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table></div>
		<?php endif; ?>
	</div>
</div>

<div class="csaam-card">
	<h2><?php esc_html_e( 'Advertenties', 'clean-seo-ads-ai' ); ?></h2>
	<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
		<thead><tr><th><?php esc_html_e( 'Advertentie', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Sterkte', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Landingspagina', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'CTR', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Conv.', 'clean-seo-ads-ai' ); ?></th></tr></thead>
		<tbody>
		<?php foreach ( $ads['ads'] as $a ) : ?>
			<tr>
				<td><strong><?php echo esc_html( implode( ' | ', array_slice( $a['headlines'], 0, 3 ) ) ); ?></strong><br><span class="csaam-muted"><?php echo esc_html( implode( ' ', array_slice( $a['descriptions'], 0, 1 ) ) ); ?></span><br><small><?php echo esc_html( $a['campaign'] . ' › ' . $a['ad_group'] ); ?></small></td>
				<td><?php echo esc_html( $a['strength'] ? $a['strength'] : '—' ); ?></td>
				<td class="csaam-url"><?php echo esc_html( (string) wp_parse_url( $a['final_url'], PHP_URL_PATH ) ); ?></td>
				<td><?php echo esc_html( Admin::num( $a['ctr'], 2 ) ); ?>%</td>
				<td><?php echo esc_html( Admin::num( $a['conversions'], 1 ) ); ?></td>
			</tr>
		<?php endforeach; ?>
		</tbody>
	</table></div>
</div>
