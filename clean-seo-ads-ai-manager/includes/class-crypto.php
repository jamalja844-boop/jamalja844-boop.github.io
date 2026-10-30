<?php
/**
 * Versleuteling van API-sleutels en OAuth-tokens in de database.
 *
 * Sleutel: CSAAM_ENCRYPTION_KEY (wp-config.php) of, als die ontbreekt,
 * afgeleid van de WordPress-salts. Wijzigen van de salts maakt opgeslagen
 * geheimen onleesbaar; ze moeten dan opnieuw worden ingevoerd.
 *
 * @package CSAAM
 */

namespace CSAAM;

defined( 'ABSPATH' ) || exit;

/**
 * Crypto.
 */
class Crypto {

	const PREFIX = 'csaam1:';

	/**
	 * Afgeleide 32-byte sleutel.
	 *
	 * @return string
	 */
	private static function key() {
		$material = defined( 'CSAAM_ENCRYPTION_KEY' ) && CSAAM_ENCRYPTION_KEY
			? (string) CSAAM_ENCRYPTION_KEY
			: wp_salt( 'auth' ) . wp_salt( 'secure_auth' );
		return hash_hmac( 'sha256', 'csaam-secrets', $material, true );
	}

	/**
	 * Versleutelt een string.
	 *
	 * @param string $plain Onversleutelde waarde.
	 * @return string
	 */
	public static function encrypt( $plain ) {
		$plain = (string) $plain;
		if ( '' === $plain ) {
			return '';
		}
		if ( function_exists( 'sodium_crypto_secretbox' ) ) {
			$nonce = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
			$box   = sodium_crypto_secretbox( $plain, $nonce, self::key() );
			return self::PREFIX . 's:' . base64_encode( $nonce . $box ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		}
		$iv     = random_bytes( 12 );
		$tag    = '';
		$cipher = openssl_encrypt( $plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag );
		return self::PREFIX . 'o:' . base64_encode( $iv . $tag . $cipher ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
	}

	/**
	 * Ontsleutelt een string. Geeft '' terug bij een ongeldige waarde.
	 *
	 * @param string $stored Opgeslagen waarde.
	 * @return string
	 */
	public static function decrypt( $stored ) {
		$stored = (string) $stored;
		if ( 0 !== strpos( $stored, self::PREFIX ) ) {
			return '';
		}
		$mode = substr( $stored, strlen( self::PREFIX ), 1 );
		$raw  = base64_decode( substr( $stored, strlen( self::PREFIX ) + 2 ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		if ( false === $raw ) {
			return '';
		}
		if ( 's' === $mode && function_exists( 'sodium_crypto_secretbox_open' ) ) {
			$nonce = substr( $raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
			$box   = substr( $raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
			$plain = sodium_crypto_secretbox_open( $box, $nonce, self::key() );
			return false === $plain ? '' : $plain;
		}
		if ( 'o' === $mode ) {
			$iv     = substr( $raw, 0, 12 );
			$tag    = substr( $raw, 12, 16 );
			$cipher = substr( $raw, 28 );
			$plain  = openssl_decrypt( $cipher, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag );
			return false === $plain ? '' : $plain;
		}
		return '';
	}
}
