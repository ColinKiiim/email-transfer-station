<script setup>
import { computed } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../../store'
import { sanitizeRichText } from '../../security/safe-html'

const { announcement, openSettings } = useGlobalState()
const { t } = useScopedI18n('views.common.About')
const safeAnnouncement = computed(() => sanitizeRichText(announcement.value))
</script>

<template>
    <div class="about-shell">
        <div class="about-card">
            <!-- Brand header -->
            <div class="about-brand-header">
                <div class="about-brand-icon">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="3" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                </div>
                <h2 class="about-title">{{ openSettings.title || t('title') }}</h2>
                <p class="about-desc">{{ openSettings.description || t('description') }}</p>
            </div>

            <!-- Announcement section -->
            <div v-if="safeAnnouncement" class="about-announcement-card">
                <div class="announcement-badge">
                    <span>📢 {{ t('announcement') }}</span>
                </div>
                <div class="announcement-content" v-html="safeAnnouncement"></div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.about-shell {
    display: flex;
    justify-content: center;
    padding: 16px 0;
}

.about-card {
    max-width: 640px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 32px 24px;
    border-radius: 16px;
    background: var(--ets-surface);
    border: 1px solid var(--ets-border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    text-align: center;
    box-sizing: border-box;
}

.about-brand-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
}

.about-brand-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: #ffffff;
    display: grid;
    place-items: center;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
}

.about-title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: var(--ets-text);
}

.about-desc {
    margin: 0;
    font-size: 14px;
    color: var(--ets-text-muted);
    max-width: 480px;
    line-height: 1.6;
}

.about-announcement-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 18px;
    border-radius: 10px;
    background: var(--ets-surface-alt, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--ets-border);
    text-align: left;
}

.announcement-badge {
    font-size: 13px;
    font-weight: 600;
    color: var(--ets-brand, #3b82f6);
}

.announcement-content {
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--ets-text);
}
</style>
