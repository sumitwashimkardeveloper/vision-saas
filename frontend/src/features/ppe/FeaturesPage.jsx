import GenericFeatureManagePage from "./manage/GenericFeatureManagePage.jsx";
import { FEATURE_MANAGE_PAGES } from "./manage/featureManagePages.jsx";

export default function FeaturesPage({ group: groupKey, featureKey }) {
  const ManagePage = FEATURE_MANAGE_PAGES[featureKey];

  if (ManagePage) {
    return <ManagePage />;
  }

  return <GenericFeatureManagePage group={groupKey} featureKey={featureKey} />;
}
