import { PickerDetails } from '../screens/PickerDetailsScreen';

/**
 * Check if user profile is complete with all required fields
 */
export const isProfileComplete = (details: PickerDetails | null | undefined): boolean => {
    if (!details) return false;

    // Required fields
    if (!details.fullName || !details.fullName.trim()) return false;
    if (!details.phoneNumber || !details.phoneNumber.trim()) return false;

    return true;
};

/**
 * Get user-friendly message for incomplete profile
 */
export const getIncompleteProfileMessage = (): string => {
    return 'Please complete your profile before picking orders. Your profile must include your full name.';
};
