import { Knex } from 'knex';

/**
 * Migration: Simplify Cross-Day Rules Configuration
 * 
 * This migration removes the `rules` array from `crossDayCheckout` configuration
 * in the attendance_rules table. The time thresholds are now read from `lateRules`
 * instead of being stored separately in `crossDayCheckout.rules`.
 * 
 * Changes:
 * - Remove `crossDayCheckout.rules` array from existing records
 * - Keep only: enabled, enableLookback, lookbackDays
 */

export async function up(knex: Knex): Promise<void> {
    console.log('[Migration 007] Starting: Simplify cross-day rules configuration');

    // Get all attendance rule records
    const records = await knex('attendance_rule_configs').select('*');

    console.log(`[Migration 007] Found ${records.length} attendance rule records to update`);

    // Update each record
    for (const record of records) {
        try {
            // Parse the rules JSON
            const rules = typeof record.rules === 'string' 
                ? JSON.parse(record.rules) 
                : record.rules;

            // Check if crossDayCheckout exists and has rules array
            if (rules && rules.crossDayCheckout && rules.crossDayCheckout.rules) {
                console.log(`[Migration 007] Updating record ${record.id} (${record.company_id})`);
                console.log(`[Migration 007] Before: crossDayCheckout has ${rules.crossDayCheckout.rules.length} rules`);

                // Remove the rules array, keep only the configuration flags
                const updatedCrossDayCheckout = {
                    enabled: rules.crossDayCheckout.enabled ?? true,
                    enableLookback: rules.crossDayCheckout.enableLookback ?? false,
                    lookbackDays: rules.crossDayCheckout.lookbackDays ?? 10
                };

                // Update the rules object
                rules.crossDayCheckout = updatedCrossDayCheckout;

                // Save back to database
                await knex('attendance_rule_configs')
                    .where('id', record.id)
                    .update({
                        rules: JSON.stringify(rules),
                        updated_at: knex.fn.now()
                    });

                console.log(`[Migration 007] After: crossDayCheckout simplified (enabled=${updatedCrossDayCheckout.enabled}, enableLookback=${updatedCrossDayCheckout.enableLookback}, lookbackDays=${updatedCrossDayCheckout.lookbackDays})`);
            } else {
                console.log(`[Migration 007] Record ${record.id} (${record.company_id}) does not have crossDayCheckout.rules, skipping`);
            }
        } catch (error) {
            console.error(`[Migration 007] Error updating record ${record.id}:`, error);
            // Continue with other records even if one fails
        }
    }

    console.log('[Migration 007] Completed: Cross-day rules configuration simplified');
}

export async function down(knex: Knex): Promise<void> {
    console.log('[Migration 007] Rollback: Restoring cross-day rules configuration');

    // Get all attendance rule records
    const records = await knex('attendance_rule_configs').select('*');

    console.log(`[Migration 007] Found ${records.length} attendance rule records to rollback`);

    // Restore default rules for each record
    for (const record of records) {
        try {
            // Parse the rules JSON
            const rules = typeof record.rules === 'string' 
                ? JSON.parse(record.rules) 
                : record.rules;

            // Check if crossDayCheckout exists
            if (rules && rules.crossDayCheckout) {
                console.log(`[Migration 007] Restoring record ${record.id} (${record.company_id})`);

                // Restore default rules array
                const restoredCrossDayCheckout = {
                    enabled: rules.crossDayCheckout.enabled ?? true,
                    enableLookback: rules.crossDayCheckout.enableLookback ?? false,
                    lookbackDays: rules.crossDayCheckout.lookbackDays ?? 10,
                    rules: [
                        {
                            checkoutTime: "18:30",
                            nextCheckinTime: "09:00",
                            description: "晚上18:30打卡，第二天可以9点打卡",
                            applyTo: "all"
                        },
                        {
                            checkoutTime: "20:30",
                            nextCheckinTime: "09:30",
                            description: "晚上20:30打卡，第二天可以9点半打卡",
                            applyTo: "all"
                        },
                        {
                            checkoutTime: "24:00",
                            nextCheckinTime: "13:30",
                            description: "晚上24点打卡，第二天可以中午13点半打卡",
                            applyTo: "all"
                        }
                    ]
                };

                // Update the rules object
                rules.crossDayCheckout = restoredCrossDayCheckout;

                // Save back to database
                await knex('attendance_rule_configs')
                    .where('id', record.id)
                    .update({
                        rules: JSON.stringify(rules),
                        updated_at: knex.fn.now()
                    });

                console.log(`[Migration 007] Restored record ${record.id} with ${restoredCrossDayCheckout.rules.length} default rules`);
            }
        } catch (error) {
            console.error(`[Migration 007] Error restoring record ${record.id}:`, error);
            // Continue with other records even if one fails
        }
    }

    console.log('[Migration 007] Rollback completed: Cross-day rules configuration restored');
}
