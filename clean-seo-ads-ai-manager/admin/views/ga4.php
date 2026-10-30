<?php
/**
 * Google Analytics 4.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Integrations\Analytics;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

Admin::heading( __( 'Google Analytics', 'clean-seo-ads-ai' ), __( 'Bezoek, kanalen en belangrijke gebeurtenissen uit GA4. Deze plugin plaatst zelf geen GA4-tag.', 'clean-seo-ads-ai' ), true, true );

$ga = Analytics::overview( $days, $refresh );
if ( is_wp_error( $ga ) ) {
	Admin::empty_state( $ga );
	return;
}
$t     = $ga['totals'];
$p     = $ga['previous'];
$get   = static function ( $arr, $key ) {
	return is_array( $arr ) && isset( $arr[ $key ] ) ? (float) $arr[ $key ] : 0.0;
};
$delta = static function ( $key ) use ( $t, $p, $get ) {
	return $p && $get( $p, $key ) ? round( ( $get( $t, $key ) - $get( $p, $key ) ) / $get( $p, $key ) * 100, 1 ) : null;
};
?>
<section class="csaam-tiles">
	<?php
	Admin::tile( __( 'Sessies', 'clean-seo-ads-ai' ), Admin::num( $get( $t, 'sessions' ) ), $delta( 'sessions' ) );
	Admin::tile( __( 'Gebruikers', 'clean-seo-ads-ai' ), Admin::num( $get( $t, 'totalUsers' ) ), $delta( 'totalUsers' ) );
	Admin::tile( __( 'Betrokken sessies', 'clean-seo-ads-ai' ), Admin::num( $get( $t, 'engagedSessions' ) ), $delta( 'engagedSessions' ) );
	Admin::tile( __( 'Betrokkenheid', 'clean-seo-ads-ai' ), Admin::num( $get( $t, 'engagementRate' ) * 100, 1 ) . '%' );
	Admin::tile( __( 'Belangrijke gebeurtenissen', 'clean-seo-ads-ai' ), Admin::num( $get( $t, 'keyEvents' ) ), $delta( 'keyEvents' ), __( 'Conversies zoals ingesteld in GA4', 'clean-seo-ads-ai' ) );
	?>
</section>
<div class="csaam-card">
	<?php
	$points = array();
	foreach ( $ga['daily'] as $d ) {
		$points[] = array( $d['date'], $d['sessions'] );
	}
	Admin::chart( $points, __( 'Sessies per dag', 'clean-seo-ads-ai' ) );
	?>
</div>
<div class="csaam-grid">
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Kanalen', 'clean-seo-ads-ai' ); ?></h2>
		<table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Kanaal', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Sessies', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Betrokken', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Gebeurtenissen', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( $ga['channels'] as $c ) : ?>
				<tr><td><?php echo esc_html( $c['sessionDefaultChannelGroup'] ); ?></td><td><?php echo esc_html( Admin::num( $c['sessions'] ) ); ?></td><td><?php echo esc_html( Admin::num( $c['engagedSessions'] ) ); ?></td><td><?php echo esc_html( Admin::num( $c['keyEvents'] ) ); ?></td></tr>
			<?php endforeach; ?>
			</tbody>
		</table>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Landingspagina\'s', 'clean-seo-ads-ai' ); ?></h2>
		<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Pagina', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Sessies', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Betrokkenheid', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Gebeurtenissen', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( array_slice( $ga['landing'], 0, 25 ) as $l ) : ?>
				<tr><td class="csaam-url"><?php echo esc_html( $l['landingPage'] ); ?></td><td><?php echo esc_html( Admin::num( $l['sessions'] ) ); ?></td><td><?php echo esc_html( Admin::num( $l['engagementRate'] * 100, 1 ) ); ?>%</td><td><?php echo esc_html( Admin::num( $l['keyEvents'] ) ); ?></td></tr>
			<?php endforeach; ?>
			</tbody>
		</table></div>
	</div>
</div>
<div class="csaam-grid">
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Belangrijke gebeurtenissen', 'clean-seo-ads-ai' ); ?></h2>
		<?php if ( ! $ga['events'] ) : ?>
			<p class="csaam-muted"><?php esc_html_e( 'Geen belangrijke gebeurtenissen (conversies) gemeten. Markeer in GA4 bijvoorbeeld "generate_lead" en "phone_click" als belangrijke gebeurtenis.', 'clean-seo-ads-ai' ); ?></p>
		<?php else : ?>
			<table class="widefat striped csaam-table">
				<thead><tr><th><?php esc_html_e( 'Gebeurtenis', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Aantal', 'clean-seo-ads-ai' ); ?></th></tr></thead>
				<tbody>
				<?php foreach ( $ga['events'] as $e ) : ?>
					<tr><td><?php echo esc_html( $e['eventName'] ); ?></td><td><?php echo esc_html( Admin::num( $e['keyEvents'] ) ); ?></td></tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Apparaten', 'clean-seo-ads-ai' ); ?></h2>
		<table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Apparaat', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Sessies', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Gebeurtenissen', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( $ga['devices'] as $d ) : ?>
				<tr><td><?php echo esc_html( ucfirst( $d['deviceCategory'] ) ); ?></td><td><?php echo esc_html( Admin::num( $d['sessions'] ) ); ?></td><td><?php echo esc_html( Admin::num( $d['keyEvents'] ) ); ?></td></tr>
			<?php endforeach; ?>
			</tbody>
		</table>
	</div>
</div>
