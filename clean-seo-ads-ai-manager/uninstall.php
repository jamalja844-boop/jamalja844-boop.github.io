<?php
/**
 * Verwijderen van de plugin: tabellen, opties, transients en capability.
 * Toegepaste SEO-titels/descriptions in de SEO-plugin en AI-concepten blijven
 * bewust bestaan (dat is inhoud van de website).
 *
 * @package CSAAM
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

foreach ( array( 'audit', 'proposals', 'events', 'log' ) as $csaam_table ) {
	$wpdb->query( 'DROP TABLE IF EXISTS ' . $wpdb->prefix . 'csaam_' . $csaam_table ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.NotPrepared
}

// Google-toegang intrekken voordat de tokens verdwijnen is niet mogelijk zonder
// sleutel-ontsleuteling buiten de plugin; de eigenaar kan dit in het Google-account doen.
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE 'csaam\_%' OR option_name LIKE '\_transient\_csaam\_%' OR option_name LIKE '\_transient\_timeout\_csaam\_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery

$csaam_role = get_role( 'administrator' );
if ( $csaam_role ) {
	$csaam_role->remove_cap( 'csaam_manage' );
}

wp_clear_scheduled_hook( 'csaam_weekly_audit' );
wp_clear_scheduled_hook( 'csaam_monthly_report' );
wp_clear_scheduled_hook( 'csaam_daily_prune' );
