// Dashboard page - customer portal showing subscription, account settings, and VPN credentials.
// Decomposed into focused sub-components: SubscriptionSection, AccountSettingsSection,
// VpnCredentialsSection, CancelModal, DeleteModal.
// Original 659-line file reduced to ~150 lines.
import { useState, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../api/client';
import { AuthContext } from './_app';
import styles from '../components/dashboard/styles';
import SubscriptionSection from '../components/dashboard/SubscriptionSection';
import AccountSettingsSection from '../components/dashboard/AccountSettingsSection';
import VpnCredentialsSection from '../components/dashboard/VpnCredentialsSection';
import CancelModal from '../components/dashboard/CancelModal';
import DeleteModal from '../components/dashboard/DeleteModal';

export default function Dashboard() {
  const router = useRouter();
  const auth = useContext(AuthContext);

  // Redirect if not logged in
  useEffect(() => {
    if (!auth?.isLoggedIn) {
      router.push('/login');
    }
  }, [auth, router]);

  const [subscription, setSubscription] = useState(null);
  const [profile, setProfile] = useState(null);
  const [paymentMethod] = useState('crypto'); // crypto by default; future: could persist user preference
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load profile + subscription data on mount
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const profileResponse = await api.getUser();
        const profileData = profileResponse?.data?.data || profileResponse?.data || null;
        setProfile(profileData);
      } catch (err) {
        console.error('Failed to load profile', err);
      }

      try {
        const response = await api.getSubscription();
        const subData = response?.data?.data || response?.data || null;
        setSubscription(subData);
      } catch (err) {
        console.error('Failed to load subscription', err);
      }
    };

    if (auth?.isLoggedIn) {
      loadDashboardData();
    }
  }, [auth]);

  const handleCancelSubscription = async () => {
    setCancelLoading(true);
    try {
      await api.cancelSubscription();
      setSubscription(null);
      setShowCancelModal(false);
    } catch (err) {
      console.error('Failed to cancel subscription');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      await api.deleteAccount();
      auth.logout();
      router.push('/');
    } catch (err) {
      console.error('Failed to delete account');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!auth?.isLoggedIn) {
    return null;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Dashboard</h1>

      {/* Subscription Status — shows active sub details or plan selection grid */}
      <SubscriptionSection
        subscription={subscription}
        paymentMethod={paymentMethod}
        onCancel={() => setShowCancelModal(true)}
      />

      {/* Account Settings — password change, recovery kit, data export, delete */}
      <AccountSettingsSection
        profile={profile}
        onDeleteClick={() => setShowDeleteModal(true)}
      />

      {/* VPN Credentials — shows username/password once provisioned after payment */}
      <VpnCredentialsSection profile={profile} subscription={subscription} />

      {/* Cancel Subscription confirmation modal */}
      {showCancelModal && (
        <CancelModal
          onCancel={() => setShowCancelModal(false)}
          onConfirm={handleCancelSubscription}
          loading={cancelLoading}
        />
      )}

      {/* Delete Account confirmation modal */}
      {showDeleteModal && (
        <DeleteModal
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteAccount}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
