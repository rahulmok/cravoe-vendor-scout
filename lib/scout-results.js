export function prepareDemoResults(leads = []) {
  return leads.map(lead => ({
    ...lead,
    demo: true,
    researched: false,
    researchStatus: 'pending',
    lifecycleStatus: 'REVIEW',
    fitStatus: 'REVIEW',
    estimatedOutlets: null,
    brandOutletCount: null,
    hiddenGem: false,
    tooBigForCravoe: false,
    researchReason: 'Demo profile only — outlet count and Cravoe fit are not verified.',
  }))
}
