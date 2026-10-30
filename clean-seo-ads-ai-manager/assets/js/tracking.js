/**
 * Clean SEO & Ads AI Manager — cookieloze leadmeting.
 * Slaat geen cookies of persoonsgegevens op. Doorsturen naar GA4/Ads gebeurt
 * uitsluitend via een al aanwezige gtag/GTM-installatie (Consent Mode blijft leidend).
 */
( function () {
	'use strict';

	var cfg = window.csaamTracking;
	if ( ! cfg ) {
		return;
	}

	function hasConsent() {
		if ( ! cfg.consent ) {
			return true;
		}
		if ( typeof window.wp_has_consent === 'function' ) {
			return window.wp_has_consent( 'statistics' );
		}
		return true; // Geen WP Consent API: anonieme, cookieloze telling.
	}

	function gtmPresent() {
		if ( ! window.google_tag_manager ) {
			return false;
		}
		return Object.keys( window.google_tag_manager ).some( function ( k ) {
			return k.indexOf( 'GTM-' ) === 0;
		} );
	}

	function forward( name, params ) {
		if ( cfg.forward === false ) {
			return;
		}
		if ( gtmPresent() && Array.isArray( window.dataLayer ) ) {
			window.dataLayer.push( Object.assign( { event: name }, params ) );
		} else if ( typeof window.gtag === 'function' ) {
			window.gtag( 'event', name, params );
		} else if ( cfg.forward === true && Array.isArray( window.dataLayer ) ) {
			window.dataLayer.push( Object.assign( { event: name }, params ) );
		}
	}

	function beacon( type, label ) {
		if ( ! hasConsent() ) {
			return;
		}
		var body = new URLSearchParams( { type: type, label: label || '', path: window.location.pathname } );
		try {
			if ( navigator.sendBeacon && navigator.sendBeacon( cfg.endpoint, body ) ) {
				return;
			}
		} catch ( e ) {}
		if ( window.fetch ) {
			window.fetch( cfg.endpoint, { method: 'POST', body: body, keepalive: true, credentials: 'omit' } );
		}
	}

	function matchesSelector( el ) {
		for ( var i = 0; i < cfg.selectors.length; i++ ) {
			try {
				if ( el.closest( cfg.selectors[ i ] ) ) {
					return true;
				}
			} catch ( e ) {}
		}
		return false;
	}

	document.addEventListener( 'click', function ( ev ) {
		var a = ev.target && ev.target.closest ? ev.target.closest( 'a, button' ) : null;
		if ( ! a ) {
			return;
		}
		var href = ( a.getAttribute( 'href' ) || '' ).toLowerCase();
		if ( cfg.phone && href.indexOf( 'tel:' ) === 0 ) {
			beacon( 'phone', 'tel' );
			forward( 'phone_click', { lead_type: 'phone' } );
		} else if ( cfg.email && href.indexOf( 'mailto:' ) === 0 ) {
			beacon( 'email', 'mailto' );
			forward( 'email_click', { lead_type: 'email' } );
		} else if ( cfg.whatsapp && ( href.indexOf( 'wa.me/' ) !== -1 || href.indexOf( 'whatsapp' ) !== -1 ) ) {
			beacon( 'whatsapp', 'whatsapp' );
			forward( 'whatsapp_click', { lead_type: 'whatsapp' } );
		} else if ( cfg.selectors.length && matchesSelector( a ) ) {
			beacon( 'cta', ( a.textContent || '' ).trim().slice( 0, 80 ) );
			forward( 'quote_cta_click', { lead_type: 'cta' } );
		}
	}, true );

	if ( ! cfg.forms ) {
		return;
	}

	// Formulieren worden server-side geteld; hier alleen doorsturen naar GA4/Ads.
	function formLead( key, name ) {
		var type = cfg.formTypes && cfg.formTypes[ key ];
		if ( ! type ) {
			type = cfg.quote.some( function ( q ) {
				return q && String( name || '' ).toLowerCase().indexOf( q.toLowerCase() ) !== -1;
			} ) ? 'quote_form' : 'contact';
		}
		forward( 'generate_lead', { lead_type: type, form_id: String( key ).slice( 0, 60 ) } );
	}

	document.addEventListener( 'wpcf7mailsent', function ( ev ) {
		formLead( 'cf7-' + ( ev.detail && ev.detail.contactFormId ? ev.detail.contactFormId : '' ), '' );
	} );

	if ( window.jQuery ) {
		window.jQuery( document ).on( 'gform_confirmation_loaded', function ( e, formId ) {
			formLead( 'gravity-' + formId, '' );
		} );
		window.jQuery( document ).on( 'wpformsAjaxSubmitSuccess', function ( e ) {
			var id = e.target && e.target.getAttribute ? e.target.getAttribute( 'data-formid' ) : '';
			formLead( 'wpforms-' + id, '' );
		} );
		window.jQuery( document ).on( 'submit_success', function ( e ) {
			var name = e.target && e.target.getAttribute ? e.target.getAttribute( 'name' ) : '';
			formLead( 'elementor-' + name, name );
		} );
		window.jQuery( document ).on( 'fluentform_submission_success', function ( e ) {
			var id = e.target && e.target.getAttribute ? e.target.getAttribute( 'data-form_id' ) : '';
			formLead( 'fluent-' + id, '' );
		} );
	}
}() );
