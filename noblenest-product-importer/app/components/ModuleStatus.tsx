/**
 * Eerlijke statuspagina voor modules die nog in ontwikkeling zijn.
 * Bevat bewust geen knoppen of formulieren die (nog) niets doen.
 */
export function ModuleStatus({
  heading,
  phase,
  intro,
  features,
  meanwhile,
}: {
  heading: string;
  phase: number;
  intro: string;
  features: string[];
  meanwhile?: { label: string; href: string };
}) {
  return (
    <s-page heading={heading} inlineSize="base">
      <s-banner tone="info" heading={`Deze module wordt gebouwd in fase ${phase}`}>
        <s-paragraph>
          Noblenest toont alleen functies die echt werken. Deze module is gepland en nog niet actief.
        </s-paragraph>
      </s-banner>
      <s-section heading="Wat deze module gaat doen">
        <s-stack direction="block" gap="base">
          <s-paragraph>{intro}</s-paragraph>
          <s-unordered-list>
            {features.map((f) => (
              <s-list-item key={f}>{f}</s-list-item>
            ))}
          </s-unordered-list>
        </s-stack>
      </s-section>
      {meanwhile ? (
        <s-section heading="Nu al beschikbaar">
          <s-paragraph>
            <s-link href={meanwhile.href}>{meanwhile.label}</s-link>
          </s-paragraph>
        </s-section>
      ) : null}
    </s-page>
  );
}
