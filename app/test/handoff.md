# Handoff: Performance Regression in `replace()` Method

## Project Goal
Diagnose and fix a severe performance regression in the `replace()` method of the `genome` class. The method takes ~5 minutes to execute on a ~300,000 character sequence with a 20-character motif pattern.

## Current Progress

### Files Identified
- **Primary file**: `/home/afaucheryved/Documents/stage_2026/SpliceProbRepo/app/domain/sequence_functions.py`
  - Contains `replace()` method (lines 300-325)
  - Contains `_track_pattern_match_variants()` method (lines 257-298)
  - Contains `_pattern_to_regex()` method (lines 220-255)

- **Supporting file**: `/home/afaucheryved/Documents/stage_2026/SpliceProbRepo/app/domain/mixins.py`
  - Contains `_track_alteration()` method (lines 59-162)

- **Supporting file**: `/home/afaucheryved/Documents/stage_2026/SpliceProbRepo/app/services/general_services.py`
  - Contains `result_per_sequences()` method (lines 57-87)
  - This method runs a **neural network model** on the sequence via `my_model.run()`

- **Test file**: `/home/afaucheryved/Documents/stage_2026/SpliceProbRepo/app/test/input/sequence_300k_length.txt`
  - ~205,873 characters (200KB+)

### Analysis Completed

#### Step 1: Understanding the Code Flow

The `replace()` method:
1. Calls `_pattern_to_regex()` to convert the pattern to a regex
2. Calls `re.finditer()` to find all matches
3. Calls `re.sub()` to perform the replacement
4. Calls `_track_alteration()` to track the main mutation
5. Calls `_track_pattern_match_variants()` to track per-match variants

#### Step 2: Identifying the Bottleneck

The critical issue is in `_track_pattern_match_variants()` (lines 284-286):

```python
for i, match in enumerate(matches, start=1):
    self.altered_sequence = build_variant(match)
    self._track_alteration(
        f"{label_prefix}[match {i}/{n}]@{match.start() + 1}",
        match_start=match.start(),
        match_end=max(match.start(), match.end() - 1),
    )
```

For each match found, it:
1. Builds a full variant of the ~300k sequence via `build_variant` (the lambda passed from `replace()` at line 322: `lambda m: base_sequence[: m.start()] + new + base_sequence[m.end():]`)
2. Calls `_track_alteration()` which in turn calls `self.result_per_sequences(using_altered_sequence=True)`

**The key finding**: `result_per_sequences()` (in `general_services.py` line 68) runs:
```python
y = my_model.run(x_input = self.altered_sequence, models_used=specified_models_used)[0]
```

This is a **neural network inference** call on the ~300k sequence. If there are many matches, this runs the neural network **once per match**.

#### Step 3: Estimating the Scale

With a 20-character wildcard pattern like `"_" * 20` (20 underscores matching any base each):
- This generates a regex pattern that matches any 20 consecutive bases
- On a 200k+ sequence, this can match **~10,000+ times** (actual count: 10,293 matches)
- For each match, `_track_alteration()` is called, running the neural network model
- Running a neural network 10,000+ times on 200k+ sequences = **~5+ minutes**

### Root Cause (Confirmed)

**The bottleneck is `_track_pattern_match_variants()` calling `_track_alteration()` for each match, and `_track_alteration()` running a neural network model inference for each call.**

This is O(n_matches × model_inference_time) which is unacceptable for patterns with many matches.

## Pending Tasks

1. **Fix the performance issue**: Modify `_track_pattern_match_variants()` to avoid calling `_track_alteration()` for every match, or modify the approach to avoid running the neural network model repeatedly

2. **Validate the fix**: Run existing tests to ensure no behavioral regression

3. **Test with the 300k sequence**: Verify the fix reduces execution time from ~5 minutes to acceptable levels

## Important Implementation Details

- The `_track_pattern_match_variants()` method is specifically for Task 17 - tracking per-match variants
- Each variant should have its own entry in the `altered_sequences` list in Redis
- The `altered_sequence` field in each entry stores the full sequence for that variant
- The `_track_alteration()` call persists each variant to Redis
- The `result_per_sequences()` call computes probability scores for each variant

- For patterns with many matches (10k+), the current approach is fundamentally broken
- The fix must maintain the same tracking behavior (each match gets its own entry)
- But must avoid the O(n_matches × sequence_length × model_cost) complexity

## Critical Insight

The `_track_alteration` method does **three expensive things** per call:
1. `result_per_sequences(using_altered_sequence=True)` - runs neural network on altered_sequence
2. `tuple_mutation(base_seq, altered_seq)` - position-wise diff
3. `compute_delta_result(...)` - delta computation

For `_track_pattern_match_variants`, we could potentially:
- **Skip the neural network call**: Don't compute `proba_simple` for per-match variants, or compute it once and reuse
- **Lazy evaluation**: Store the variant sequence but defer probability computation
- **Batch processing**: But this would require significant changes to the architecture

The minimal fix would be to **skip the expensive probability computations** for per-match variants, as they're only used for tracking/visualization (Task 17) and the main entry already has the full probability data.

## Files Involved

1. `/home/afaucheryved/Documents/stage_2026/SpliceProbRepo/app/domain/sequence_functions.py` - PRIMARY TARGET
   - `_track_pattern_match_variants()` method needs modification

2. `/home/afaucheryved/Documents/stage_2026/SpliceProbRepo/app/domain/mixins.py` - SUPPORTING
   - `_track_alteration()` method - may need optional parameter to skip expensive computations

3. Test files for validation:
   - `/home/afaucheryved/Documents/stage_2026/SpliceProbRepo/app/test/test_mixins.py` (lines 423-518)
   - `/home/afaucheryved/Documents/stage_2026/SpliceProbRepo/app/test/test_alteration_functions.py` (lines 161-186)

## Suggested Fix Approach

The minimal fix should modify `_track_pattern_match_variants()` to:
1. Still create entries for each match (to maintain the API)
2. But call a lightweight version of `_track_alteration()` that skips `result_per_sequences()`

OR (even simpler):
- Add a parameter to `_track_alteration()` to optionally skip probability computation
- Pass this parameter from `_track_pattern_match_variants()`

This would reduce the per-match cost from ~0.05s (model inference) to ~0.0001s (just string operations and Redis write), making 10k matches take ~1 second instead of 500+ seconds.
