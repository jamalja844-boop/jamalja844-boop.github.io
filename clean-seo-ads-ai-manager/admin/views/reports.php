<?php
/**
 * Rapportages.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Modules\Reports;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

Admin::heading( __( 'Rapportages', 'clean-seo-ads-ai' ), __( 'Google-prestaties, leads en SEO-voortgang in één rapport — te printen als PDF of te downloaden als CSV.', 'clean-seo-ads-ai' ), true );

$report = Reports::build( $days );
?>
<p class="csaam-noprint">
	<button type="button" class="button button-primary" onclick="window.print()"><?php esc_html_e( 'Printen / opslaan als PDF', 'clean-seo-ads-ai' ); ?></button>
	<a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=csaam_export_csv&days=' . $days ), 'csaam_export_csv' ) ); ?>"><?php esc_html_e( 'CSV downloaden', 'clean-seo-ads-ai' ); ?></a>
	<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=csaam-settings#reports' ) ); ?>"><?php esc_html_e( 'Maandelijkse e-mail instellen', 'clean-seo-ads-ai' ); ?></a>
</p>
<div class="csaam-card csaam-report">
	<h2>
		<?php
		/* translators: 1: bedrijf, 2: dagen */
		echo esc_html( sprintf( __( '%1$s — laatste %2$d dagen', 'clean-seo-ads-ai' ), $report['company'], $days ) );
		?>
	</h2>
	<?php if ( $report['demo'] ) : ?>
		<p><strong><?php esc_html_e( 'DEMOMODUS: dit rapport bevat voorbeeldgegevens.', 'clean-seo-ads-ai' ); ?></strong></p>
	<?php endif; ?>
	<section class="csaam-tiles">
		<?php
		Admin::tile( __( 'Leads totaal', 'clean-seo-ads-ai' ), Admin::num( $report['kpi']['leads'] ) );
		Admin::tile( __( 'Ads-kosten per lead', 'clean-seo-ads-ai' ), Admin::money( $report['kpi']['cost_per_lead'] ), null, __( 'Indicatief', 'clean-seo-ads-ai' ) );
		?>
	</section>
	<div class="csaam-grid">
	<?php foreach ( $report['sections'] as $section ) : ?>
		<div class="csaam-card">
			<h3><?php echo esc_html( $section['title'] ); ?></h3>
			<?php if ( isset( $section['error'] ) ) : ?>
				<p class="csaam-muted"><?php echo esc_html( $section['error'] ); ?></p>
			<?php else : ?>
				<table class="widefat striped csaam-table">
					<tbody>
					<?php foreach ( $section['rows'] as $row ) : ?>
						<tr>
							<td><?php echo esc_html( $row[0] ); ?></td>
							<td><strong><?php echo esc_html( is_numeric( $row[1] ) ? Admin::num( $row[1], floor( (float) $row[1] ) == $row[1] ? 0 : 2 ) : (string) $row[1] ); // phpcs:ignore Universal.Operators.StrictComparisons.LooseEqual ?></strong></td>
							<td><?php echo null === $row[2] ? '' : esc_html( ( $row[2] > 0 ? '+' : '' ) . number_format_i18n( $row[2], 1 ) . ( false !== strpos( $row[0], 'positie' ) ? '' : '%' ) ); ?></td>
						</tr>
					<?php endforeach; ?>
					</tbody>
				</table>
				<?php if ( ! empty( $section['note'] ) ) : ?>
					<p class="csaam-muted"><?php echo esc_html( $section['note'] ); ?></p>
				<?php endif; ?>
			<?php endif; ?>
		</div>
	<?php endforeach; ?>
	</div>
	<p class="csaam-footnote"><?php esc_html_e( 'Cijfers komen rechtstreeks uit de gekoppelde Google-accounts en de eigen leadtelling. Verbeteringen in Google-posities kunnen niet worden gegarandeerd.', 'clean-seo-ads-ai' ); ?></p>
</div>
