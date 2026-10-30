<?php
/**
 * Contract voor AI-providers. Extra providers kunnen via het filter
 * 'csaam_ai_providers' worden toegevoegd.
 *
 * @package CSAAM
 */

namespace CSAAM\AI;

defined( 'ABSPATH' ) || exit;

/**
 * Provider.
 */
interface Provider {

	/**
	 * Leesbare naam.
	 *
	 * @return string
	 */
	public function label();

	/**
	 * Is de provider geconfigureerd (sleutel aanwezig)?
	 *
	 * @return bool
	 */
	public function configured();

	/**
	 * Voert een gestructureerd verzoek uit.
	 *
	 * @param string $system System prompt.
	 * @param string $prompt Gebruikersbericht.
	 * @param array  $schema JSON Schema van het gewenste antwoord.
	 * @return array|\WP_Error {data:array, model:string, input_tokens:int, output_tokens:int, cost:float}
	 */
	public function structured( $system, $prompt, array $schema );
}
