// frontend/src/components/comparison/index.js
//
// DataComparison Component Structure Documentation
// ================================================
//
// The DataComparison.js file contains multiple related components for
// comparing scraped data against Oracle/API/Baseline sources.
//
// COMPONENT HIERARCHY:
//
// DataComparison (main) - Lines 55-1368
// ├── State management for single and bulk comparisons
// ├── Module selection and team filtering
// ├── Comparison execution logic
// └── PlayerMappingModal (internal component)
//
// ComparisonSummary - Lines 1370-1694
// ├── Summary statistics display
// ├── Match percentage visualization
// ├── Missing items lists
// └── Export functionality (CSV/Excel)
//
// SideBySideView - Lines 1697-2550
// ├── Two-column data comparison
// ├── Name matching and alignment
// ├── Discrepancy highlighting
// └── Scroll synchronization
//
// DiscrepanciesView - Lines 2551-2822
// ├── Filtered discrepancy list
// ├── Field-level comparisons
// └── Mapping creation interface
//
// BulkComparisonView - Lines 2823-3078
// ├── Multi-team comparison form
// ├── Module selection
// └── Bulk job configuration
//
// BulkComparisonResults - Lines 3079-3346
// ├── Job status display
// ├── Progress tracking
// └── Results summary
//
// ExpandedStatsDetails - Lines 3347-3767
// ├── Game-by-game stats view
// ├── Player stat comparisons
// └── Basketball/Football stat tables
//
// ExpandedComparisonDetails - Lines 3768-4226
// ├── Full comparison details modal
// ├── Discrepancy navigation
// └── Export options
//
// StatsByCategoryView - Lines 4227-4918
// ├── Categorized stats display
// ├── Sport-specific formatting
// └── Basketball/Football stat tables
//
// AllGamesView - Lines 4919-end
// ├── Multi-game results display
// ├── Export all games functionality
// └── Game filtering
//
// REFACTORING NOTES:
// - Components are tightly coupled through shared state
// - Many helper functions are used across components
// - Full extraction would require significant prop drilling
// - Consider using React Context for shared comparison state
// - Priority components for extraction: BulkComparisonView, StatsByCategoryView

export { default } from '../DataComparison';
