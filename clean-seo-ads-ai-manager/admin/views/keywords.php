<?php
/**
 * Zoekwoorden.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Modules\Keywords;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

Admin::heading( __( 'Zoekwoorden', 'clean-seo-ads-ai' ), __( 'Echte zoekopdrachten uit Google Search Console: waar staat u, waar liggen kansen en welke pagina\'s concurreren met elkaar?', 'clean-seo-ads-ai' ), true, true );

$data = Keywords::analyze( $days, $refresh );
if ( is_wp_error( $data ) ) {
	Admin::empty_state( $data );
	return;
}

$path = static function ( $url ) {
	$p = wp_parse_url( (string) $url, PHP_URL_PATH );
	return $p ? $p : $url;
};
?>
<div class="csaam-card">
	<h2><?php esc_html_e( 'Doelzoekwoorden', 'clean-seo-ads-ai' ); ?></h2>
	<p class="csaam-muted"><?php esc_html_e( 'Pas de lijst aan bij Instellingen → Bedrijf. Positie = gemiddelde positie in Google over de periode.', 'clean-seo-ads-ai' ); ?></p>
	<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
		<thead><tr><th><?php esc_html_e( 'Zoekwoord', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Positie', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Klikken', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Vertoningen', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'CTR', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Beste pagina', 'clean-seo-ads-ai' ); ?></th></tr></thead>
		<tbody>
		<?php foreach ( $data['tracked'] as $t ) : ?>
			<tr>
				<td><strong><?php echo esc_html( $t['keyword'] ); ?></strong><?php echo $t['variants'] ? ' <span class="csaam-muted">' . esc_html( sprintf( /* translators: %d: aantal */ __( '+%d varianten', 'clean-seo-ads-ai' ), $t['variants'] ) ) . '</span>' : ''; ?></td>
				<td><?php echo $t['found'] ? esc_html( Admin::num( $t['position'], 1 ) ) : '<span class="csaam-muted">' . esc_html__( 'niet gevonden', 'clean-seo-ads-ai' ) . '</span>'; ?></td>
				<td><?php echo esc_html( Admin::num( $t['clicks'] ) ); ?></td>
				<td><?php echo esc_html( Admin::num( $t['impressions'] ) ); ?></td>
				<td><?php echo esc_html( Admin::num( $t['ctr'], 1 ) ); ?>%</td>
				<td class="csaam-url"><?php echo esc_html( $path( $t['page'] ) ); ?></td>
			</tr>
		<?php endforeach; ?>
		</tbody>
	</table></div>
</div>

<div class="csaam-grid">
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Kansen: bijna op pagina 1', 'clean-seo-ads-ai' ); ?></h2>
		<p class="csaam-muted"><?php esc_html_e( 'Positie 4–20 met vertoningen. Verbeter hier de pagina-inhoud, titel en interne links.', 'clean-seo-ads-ai' ); ?></p>
		<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Zoekopdracht', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Pos.', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Vert.', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Pagina', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( array_slice( $data['opportunities'], 0, 20 ) as $q ) : ?>
				<tr><td><?php echo esc_html( $q['query'] ); ?></td><td><?php echo esc_html( Admin::num( $q['position'], 1 ) ); ?></td><td><?php echo esc_html( Admin::num( $q['impressions'] ) ); ?></td><td class="csaam-url"><?php echo esc_html( $path( $q['page'] ) ); ?></td></tr>
			<?php endforeach; ?>
			<?php if ( ! $data['opportunities'] ) : ?>
				<tr><td colspan="4" class="csaam-muted"><?php esc_html_e( 'Geen kansen in deze periode.', 'clean-seo-ads-ai' ); ?></td></tr>
			<?php endif; ?>
			</tbody>
		</table></div>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Lage klikratio', 'clean-seo-ads-ai' ); ?></h2>
		<p class="csaam-muted"><?php esc_html_e( 'Goede positie maar weinig klikken: titel en meta description zijn vaak de oorzaak.', 'clean-seo-ads-ai' ); ?></p>
		<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Zoekopdracht', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Pos.', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'CTR', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Indicatief', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( $data['low_ctr'] as $q ) : ?>
				<tr><td><?php echo esc_html( $q['query'] ); ?></td><td><?php echo esc_html( Admin::num( $q['position'], 1 ) ); ?></td><td><?php echo esc_html( Admin::num( $q['ctr'], 1 ) ); ?>%</td><td>±<?php echo esc_html( Admin::num( $q['expected_ctr'], 1 ) ); ?>%</td></tr>
			<?php endforeach; ?>
			<?php if ( ! $data['low_ctr'] ) : ?>
				<tr><td colspan="4" class="csaam-muted"><?php esc_html_e( 'Geen opvallend lage klikratio\'s.', 'clean-seo-ads-ai' ); ?></td></tr>
			<?php endif; ?>
			</tbody>
		</table></div>
	</div>
</div>

<div class="csaam-grid">
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Kannibalisatie', 'clean-seo-ads-ai' ); ?></h2>
		<p class="csaam-muted"><?php esc_html_e( 'Meerdere eigen pagina\'s strijden om dezelfde zoekopdracht. Kies één hoofdpagina en verwijs de andere er intern naar.', 'clean-seo-ads-ai' ); ?></p>
		<?php if ( ! $data['cannibal'] ) : ?>
			<p><?php Admin::badge( 'good', __( 'Geen kannibalisatie gevonden', 'clean-seo-ads-ai' ) ); ?></p>
		<?php else : ?>
			<ul class="csaam-list">
			<?php foreach ( $data['cannibal'] as $c ) : ?>
				<li><strong><?php echo esc_html( $c['query'] ); ?></strong>
					<ul>
					<?php foreach ( $c['pages'] as $p ) : ?>
						<li class="csaam-url"><?php echo esc_html( $path( $p['url'] ) . ' — ' . sprintf( /* translators: 1: vertoningen, 2: positie */ __( '%1$s vert., pos. %2$s', 'clean-seo-ads-ai' ), Admin::num( $p['impressions'] ), Admin::num( $p['position'], 1 ) ) ); ?></li>
					<?php endforeach; ?>
					</ul>
				</li>
			<?php endforeach; ?>
			</ul>
		<?php endif; ?>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Lokale zoekopdrachten', 'clean-seo-ads-ai' ); ?></h2>
		<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Zoekopdracht', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Pos.', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Klikken', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Vert.', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( array_slice( $data['local'], 0, 25 ) as $q ) : ?>
				<tr><td><?php echo esc_html( $q['query'] ); ?></td><td><?php echo esc_html( Admin::num( $q['position'], 1 ) ); ?></td><td><?php echo esc_html( Admin::num( $q['clicks'] ) ); ?></td><td><?php echo esc_html( Admin::num( $q['impressions'] ) ); ?></td></tr>
			<?php endforeach; ?>
			<?php if ( ! $data['local'] ) : ?>
				<tr><td colspan="4" class="csaam-muted"><?php esc_html_e( 'Geen zoekopdrachten met een plaatsnaam uit uw werkgebied.', 'clean-seo-ads-ai' ); ?></td></tr>
			<?php endif; ?>
			</tbody>
		</table></div>
	</div>
</div>

<?php if ( $data['overlap'] ) : ?>
<div class="csaam-card">
	<h2><?php esc_html_e( 'Overlap Google Ads en organisch', 'clean-seo-ads-ai' ); ?></h2>
	<p class="csaam-muted"><?php esc_html_e( 'Zoekwoorden waarop u adverteert én organisch gevonden wordt. Test voorzichtig of een lager bod dezelfde leads oplevert — wijzig niets zonder te meten.', 'clean-seo-ads-ai' ); ?></p>
	<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
		<thead><tr><th><?php esc_html_e( 'Zoekwoord', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Ads-kosten', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Ads-conversies', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Organische positie', 'clean-seo-ads-ai' ); ?></th></tr></thead>
		<tbody>
		<?php foreach ( $data['overlap'] as $o ) : ?>
			<tr><td><?php echo esc_html( $o['keyword'] ); ?></td><td><?php echo esc_html( Admin::money( $o['ads_cost'] ) ); ?></td><td><?php echo esc_html( Admin::num( $o['ads_conversions'], 1 ) ); ?></td><td><?php echo esc_html( Admin::num( $o['organic_position'], 1 ) ); ?></td></tr>
		<?php endforeach; ?>
		</tbody>
	</table></div>
</div>
<?php endif; ?>
