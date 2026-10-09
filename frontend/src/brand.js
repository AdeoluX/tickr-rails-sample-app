/**
 * Your brand. Change these to make the app yours; nothing else in the code names the brand.
 * The logo is public/favicon.svg. Colours are applied as CSS variables, for light and dark mode.
 */
export const brand = {
    name: 'Coopsaas Invest',
    tagline: 'Your cooperative, now on the stock market',
    poweredBy: 'Tickr Rails',
    savingsName: 'Coop savings',
    colors: {
        light: { brand: '#0b6b4f', brandInk: '#ffffff', brandSoft: '#e3f1ea' },
        dark: { brand: '#2fa77c', brandInk: '#04140d', brandSoft: '#173628' }
    }
};

/** Puts the brand colours and name on the page. Called once at start-up. */
export function applyBrand() {
    document.title = brand.name;
    const css = (c) => `--brand: ${c.brand}; --brand-ink: ${c.brandInk}; --brand-soft: ${c.brandSoft};`;
    const style = document.createElement('style');
    style.textContent = `:root { ${css(brand.colors.light)} } @media (prefers-color-scheme: dark) { :root { ${css(brand.colors.dark)} } }`;
    document.head.appendChild(style);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', brand.colors.light.brand);
}
