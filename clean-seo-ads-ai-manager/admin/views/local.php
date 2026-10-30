<?php
/**
 * Lokale SEO.
 *
 * @package CSAAM
 * @var int  $days
 * @var bool $refresh
 */

use CSAAM\Admin;
use CSAAM\Modules\Local_SEO;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.WP.GlobalVariablesOverride.Prohibited -- views draaien binnen Admin::render() (functiescope).

Admin::heading( __( 'Lokale SEO', 'clean-seo-ads-ai' ), __( 'Welke combinaties van dienst en plaats hebben een goede, unieke pagina? Gebaseerd op de laatste SEO-scan.', 'clean-seo-ads-ai' ) );

$data = Local_SEO::overview();
if ( ! $data['scanned'] ) {
	echo '<div class="csaam-empty"><p>' . esc_html__( 'Voer eerst een SEO-scan uit; daarna wordt de dekking per dienst en plaats berekend.', 'clean-seo-ads-ai' ) . '</p><p><a class="button button-primary" href="' . esc_url( admin_url( 'admin.php?page=csaam-seo' ) ) . '">' . esc_html__( 'Naar SEO Analyse', 'clean-seo-ads-ai' ) . '</a></p></div>';
	return;
}
?>
<div class="csaam-card">
	<h2><?php esc_html_e( 'Dekking: diensten × werkgebied', 'clean-seo-ads-ai' ); ?></h2>
	<p class="csaam-legend">
		<?php Admin::badge( 'good', __( 'Goede lokale pagina', 'clean-seo-ads-ai' ) ); ?>
		<?php Admin::badge( 'improve', __( 'Pagina gevonden, kan beter', 'clean-seo-ads-ai' ) ); ?>
		<?php Admin::badge( 'missing', __( 'Geen specifieke pagina', 'clean-seo-ads-ai' ) ); ?>
	</p>
	<div class="csaam-table-wrap">
	<table class="widefat csaam-table csaam-matrix">
		<thead><tr><th><?php esc_html_e( 'Dienst', 'clean-seo-ads-ai' ); ?></th>
		<?php foreach ( $data['cities'] as $city ) : ?>
			<th><?php echo esc_html( $city ); ?></th>
		<?php endforeach; ?>
		</tr></thead>
		<tbody>
		<?php foreach ( $data['matrix'] as $row ) : ?>
			<tr><th scope="row"><?php echo esc_html( $row['service'] ); ?></th>
			<?php foreach ( $row['cells'] as $cell ) : ?>
				<td class="is-<?php echo esc_attr( $cell['status'] ); ?>">
					<?php if ( $cell['page'] ) : ?>
						<details>
							<summary><?php Admin::badge( $cell['status'], (string) $cell['page']['score'] ); ?></summary>
							<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=csaam-seo&post=' . $cell['page']['post_id'] ) ); ?>"><?php echo esc_html( $cell['page']['title'] ); ?></a></p>
							<ul class="csaam-checks">
							<?php foreach ( $cell['checks'] as $check ) : ?>
								<li><span aria-hidden="true"><?php echo $check['ok'] ? '✓' : '✗'; ?></span> <?php echo esc_html( $check['label'] ); ?><span class="screen-reader-text"><?php echo esc_html( $check['ok'] ? __( 'in orde', 'clean-seo-ads-ai' ) : __( 'niet in orde', 'clean-seo-ads-ai' ) ); ?></span></li>
							<?php endforeach; ?>
							</ul>
						</details>
					<?php else : ?>
						<?php Admin::badge( 'missing', __( 'geen', 'clean-seo-ads-ai' ) ); ?>
					<?php endif; ?>
				</td>
			<?php endforeach; ?>
			</tr>
		<?php endforeach; ?>
		</tbody>
	</table>
	</div>
	<p class="csaam-muted"><?php esc_html_e( 'Een lege cel is geen opdracht om een pagina te maken. Maak alleen een lokale pagina als er echte vraag is (zie Zoekwoorden) én u unieke, waarheidsgetrouwe inhoud voor die plaats heeft.', 'clean-seo-ads-ai' ); ?></p>
</div>

<div class="csaam-grid">
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Uniciteit van lokale pagina\'s', 'clean-seo-ads-ai' ); ?></h2>
		<?php if ( ! $data['uniqueness'] ) : ?>
			<p><?php Admin::badge( 'good', __( 'Geen sterk overeenkomende lokale pagina\'s', 'clean-seo-ads-ai' ) ); ?></p>
		<?php else : ?>
			<div class="csaam-table-wrap"><table class="widefat striped csaam-table">
				<thead><tr><th><?php esc_html_e( 'Pagina A', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Pagina B', 'clean-seo-ads-ai' ); ?></th><th><?php esc_html_e( 'Gelijkenis', 'clean-seo-ads-ai' ); ?></th></tr></thead>
				<tbody>
				<?php foreach ( $data['uniqueness'] as $pair ) : ?>
					<tr><td><?php echo esc_html( $pair['a'] ); ?></td><td><?php echo esc_html( $pair['b'] ); ?></td><td><?php Admin::badge( $pair['similarity'] >= 85 ? 'error' : ( $pair['similarity'] >= 70 ? 'warning' : 'notice' ), $pair['similarity'] . '%' ); ?></td></tr>
				<?php endforeach; ?>
				</tbody>
			</table></div>
			<p class="csaam-muted"><?php esc_html_e( 'Boven ±70% lijken pagina\'s te veel op elkaar. Gebruik "Tekst beoordelen" of "Ontbrekende onderwerpen" in AI Optimalisatie voor unieke invalshoeken.', 'clean-seo-ads-ai' ); ?></p>
		<?php endif; ?>
	</div>
	<div class="csaam-card">
		<h2><?php esc_html_e( 'Bedrijfsgegevens (NAW)', 'clean-seo-ads-ai' ); ?></h2>
		<?php if ( $data['nap']['note'] ) : ?>
			<p><?php echo esc_html( $data['nap']['note'] ); ?></p>
		<?php else : ?>
			<ul class="csaam-checks">
				<li><?php Admin::badge( $data['nap']['phone_on_home'] ? 'ok' : 'warning' ); ?> <?php esc_html_e( 'Telefoonnummer staat op de homepage', 'clean-seo-ads-ai' ); ?></li>
				<li><?php Admin::badge( $data['nap']['address_on_home'] ? 'ok' : 'warning' ); ?> <?php esc_html_e( 'Adres staat op de homepage', 'clean-seo-ads-ai' ); ?></li>
			</ul>
		<?php endif; ?>
		<h3><?php esc_html_e( 'Advies', 'clean-seo-ads-ai' ); ?></h3>
		<ul class="csaam-list">
			<?php foreach ( $data['advice'] as $advice ) : ?>
				<li><?php echo esc_html( $advice ); ?></li>
			<?php endforeach; ?>
		</ul>
	</div>
</div>
