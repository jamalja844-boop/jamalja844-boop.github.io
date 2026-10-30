<?php
/**
 * Technische Controle.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Logger;
use CSAAM\Modules\Technical_Check;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

Admin::heading( __( 'Technische Controle', 'clean-seo-ads-ai' ), __( 'Indexering, sitemap, robots.txt, HTTPS, dubbele tracking, toestemming en conflicten tussen plugins.', 'clean-seo-ads-ai' ), false, true );

$tech  = Technical_Check::run( $refresh );
$group = '';
?>
<section class="csaam-tiles">
	<?php
	Admin::tile( __( 'In orde', 'clean-seo-ads-ai' ), Admin::num( $tech['counts']['ok'] ) );
	Admin::tile( __( 'Waarschuwingen', 'clean-seo-ads-ai' ), Admin::num( $tech['counts']['warning'] ) );
	Admin::tile( __( 'Fouten', 'clean-seo-ads-ai' ), Admin::num( $tech['counts']['error'] ) );
	?>
</section>
<div class="csaam-card">
	<div class="csaam-table-wrap"><table class="widefat csaam-table">
		<tbody>
		<?php foreach ( $tech['rows'] as $row ) : ?>
			<?php if ( $row['group'] !== $group ) : ?>
				<?php $group = $row['group']; ?>
				<tr class="csaam-group"><th colspan="4"><?php echo esc_html( $group ); ?></th></tr>
			<?php endif; ?>
			<tr>
				<td><?php Admin::badge( $row['status'] ); ?></td>
				<td><strong><?php echo esc_html( $row['label'] ); ?></strong></td>
				<td><?php echo esc_html( $row['detail'] ); ?></td>
				<td><?php echo esc_html( $row['fix'] ); ?></td>
			</tr>
		<?php endforeach; ?>
		</tbody>
	</table></div>
	<p class="csaam-muted">
		<?php
		/* translators: %s: tijd */
		echo esc_html( sprintf( __( 'Gecontroleerd: %s', 'clean-seo-ads-ai' ), wp_date( get_option( 'date_format' ) . ' H:i', $tech['checked'] ) ) );
		?>
	</p>
</div>

<div class="csaam-grid">
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Snelheid homepage (PageSpeed Insights)', 'clean-seo-ads-ai' ); ?></h2>
		<p>
			<button type="button" class="button" data-csaam-pagespeed="mobile" data-post="0"><?php esc_html_e( 'Mobiel testen', 'clean-seo-ads-ai' ); ?></button>
			<button type="button" class="button" data-csaam-pagespeed="desktop" data-post="0"><?php esc_html_e( 'Desktop testen', 'clean-seo-ads-ai' ); ?></button>
		</p>
		<div class="csaam-pagespeed-result"></div>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Omgeving', 'clean-seo-ads-ai' ); ?></h2>
		<dl class="csaam-dl">
			<dt>WordPress / PHP</dt><dd><?php echo esc_html( $tech['env']['wp_version'] . ' / ' . $tech['env']['php_version'] ); ?></dd>
			<dt><?php esc_html_e( 'Thema', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( $tech['env']['theme'] . ( $tech['env']['parent_theme'] ? ' (child van ' . $tech['env']['parent_theme'] . ')' : '' ) ); ?></dd>
			<dt><?php esc_html_e( 'Actieve plugins', 'clean-seo-ads-ai' ); ?></dt><dd><?php echo esc_html( implode( ', ', $tech['env']['active_plugins'] ) ); ?></dd>
		</dl>
	</div>
</div>

<div class="csaam-card">
	<details>
		<summary><strong><?php esc_html_e( 'Logboek (zonder gevoelige gegevens)', 'clean-seo-ads-ai' ); ?></strong></summary>
		<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
			<thead><tr><th><?php esc_html_e( 'Tijd (UTC)', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Niveau', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Onderdeel', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Melding', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Context', 'clean-seo-ads-ai' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( Logger::recent( 100 ) as $log ) : ?>
				<tr><td><?php echo esc_html( $log['created_at'] ); ?></td><td><?php echo esc_html( $log['level'] ); ?></td><td><?php echo esc_html( $log['channel'] ); ?></td><td><?php echo esc_html( $log['message'] ); ?></td><td><code><?php echo esc_html( $log['context'] ); ?></code></td></tr>
			<?php endforeach; ?>
			</tbody>
		</table></div>
	</details>
</div>
