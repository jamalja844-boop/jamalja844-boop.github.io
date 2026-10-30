<?php
/**
 * Google Search Console.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Integrations\Search_Console;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

Admin::heading( __( 'Google Search Console', 'clean-seo-ads-ai' ), __( 'Hoe vaak verschijnt de site in Google en hoe vaak wordt erop geklikt? Gegevens lopen ±3 dagen achter.', 'clean-seo-ads-ai' ), true, true );

$gsc = Search_Console::overview( $days, $refresh );
if ( is_wp_error( $gsc ) ) {
	Admin::empty_state( $gsc );
	return;
}
$t     = $gsc['totals'];
$p     = $gsc['previous'];
$delta = static function ( $now, $prev ) {
	return $prev ? round( ( $now - $prev ) / $prev * 100, 1 ) : null;
};
?>
<section class="csaam-tiles">
	<?php
	Admin::tile( __( 'Klikken', 'clean-seo-ads-ai' ), Admin::num( $t['clicks'] ), $p ? $delta( $t['clicks'], $p['clicks'] ) : null );
	Admin::tile( __( 'Vertoningen', 'clean-seo-ads-ai' ), Admin::num( $t['impressions'] ), $p ? $delta( $t['impressions'], $p['impressions'] ) : null );
	Admin::tile( __( 'CTR', 'clean-seo-ads-ai' ), Admin::num( $t['ctr'], 2 ) . '%', $p ? $delta( $t['ctr'], $p['ctr'] ) : null );
	Admin::tile( __( 'Gemiddelde positie', 'clean-seo-ads-ai' ), Admin::num( $t['position'], 1 ), $p ? $delta( $t['position'], $p['position'] ) : null, __( 'Lager is beter', 'clean-seo-ads-ai' ), true );
	?>
</section>
<div class="csaam-grid">
	<div class="csaam-card">
		<?php
		$points = array();
		foreach ( $gsc['daily'] as $d ) {
			$points[] = array( $d['date'], $d['clicks'] );
		}
		Admin::chart( $points, __( 'Klikken per dag', 'clean-seo-ads-ai' ) );
		?>
	</div>
	<div class="csaam-card">
		<?php
		$points = array();
		foreach ( $gsc['daily'] as $d ) {
			$points[] = array( $d['date'], $d['impressions'] );
		}
		Admin::chart( $points, __( 'Vertoningen per dag', 'clean-seo-ads-ai' ) );
		?>
	</div>
</div>
<div class="csaam-grid">
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Top zoekopdrachten', 'clean-seo-ads-ai' ); ?></h2>
		<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Zoekopdracht', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Klikken', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Vert.', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'CTR', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Pos.', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( array_slice( $gsc['queries'], 0, 40 ) as $q ) : ?>
				<tr><td><?php echo esc_html( $q['keys'][0] ); ?></td><td><?php echo esc_html( Admin::num( $q['clicks'] ) ); ?></td><td><?php echo esc_html( Admin::num( $q['impressions'] ) ); ?></td><td><?php echo esc_html( Admin::num( $q['ctr'], 1 ) ); ?>%</td><td><?php echo esc_html( Admin::num( $q['position'], 1 ) ); ?></td></tr>
			<?php endforeach; ?>
			</tbody>
		</table></div>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Top pagina\'s', 'clean-seo-ads-ai' ); ?></h2>
		<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Pagina', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Klikken', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Vert.', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Pos.', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( array_slice( $gsc['pages'], 0, 40 ) as $q ) : ?>
				<tr><td class="csaam-url"><?php echo esc_html( (string) wp_parse_url( $q['keys'][0], PHP_URL_PATH ) ); ?></td><td><?php echo esc_html( Admin::num( $q['clicks'] ) ); ?></td><td><?php echo esc_html( Admin::num( $q['impressions'] ) ); ?></td><td><?php echo esc_html( Admin::num( $q['position'], 1 ) ); ?></td></tr>
			<?php endforeach; ?>
			</tbody>
		</table></div>
	</div>
</div>
<div class="csaam-card">
	<h2><?php esc_html_e( 'Apparaten', 'clean-seo-ads-ai' ); ?></h2>
	<table class="widefat striped csaam-table">
		<thead><tr><th><?php esc_html_e( 'Apparaat', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Klikken', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Vert.', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Pos.', 'clean-seo-ads-ai' ); ?></th></tr></thead>
		<tbody>
		<?php foreach ( $gsc['devices'] as $q ) : ?>
			<tr><td><?php echo esc_html( ucfirst( strtolower( $q['keys'][0] ) ) ); ?></td><td><?php echo esc_html( Admin::num( $q['clicks'] ) ); ?></td><td><?php echo esc_html( Admin::num( $q['impressions'] ) ); ?></td><td><?php echo esc_html( Admin::num( $q['position'], 1 ) ); ?></td></tr>
		<?php endforeach; ?>
		</tbody>
	</table>
	<p class="csaam-muted"><?php esc_html_e( 'Indexstatus per pagina controleren? Open een pagina bij SEO Analyse en klik op "Indexstatus bij Google".', 'clean-seo-ads-ai' ); ?></p>
</div>
