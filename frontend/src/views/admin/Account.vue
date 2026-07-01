<script setup>
import { ref, h, onMounted, watch, computed } from 'vue';
import { NButton, NDropdown, NIcon, NTag, NTooltip, useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { hashPassword } from '../../utils'
import { ContentCopyOutlined, EditOutlined, LabelOutlined, MenuFilled } from '@vicons/material'
import AddressCredentialModal from '../../components/AddressCredentialModal.vue'

const {
    loading, adminTab, adminMailsTab, openSettings,
    adminMailTabAddress, adminSendBoxTabAddress
} = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.Account')

const showEmailCredential = ref(false)
const curEmailCredential = ref("")
const curEmailAddress = ref("")
const curDeleteAddressId = ref(0);
const curClearInboxAddressId = ref(0);
const curClearSentItemsAddressId = ref(0);
const showResetPassword = ref(false);
const curResetPasswordAddressId = ref(0);
const newPassword = ref('');
const showShareLink = ref(false);
const curShareAddress = ref('');
const curShareLink = ref('');
const latestShareLink = ref('');
const showCreateShareLink = ref(false);
const shareLinkForm = ref({
    addressId: 0,
    address: '',
    label: '',
    expiresAt: null,
});
const showShareTokenList = ref(false);
const shareTokenAddress = ref('');
const shareTokenAddressId = ref(0);
const shareTokenRecords = ref([]);
const showEditShareToken = ref(false);
const editShareTokenForm = ref({
    id: 0,
    label: '',
    expiresAt: null,
});
const showEditAddress = ref(false);
const editAddressForm = ref({
    id: 0,
    name: '',
    display_label: '',
    labels: [],
    owner_note: '',
});
const showRotateCredential = ref(false);
const curRotateCredentialAddressId = ref(0);
const curRotateCredentialAddress = ref('');
const showRevokeShareLinks = ref(false);
const curRevokeShareLinksAddressId = ref(0);
const curRevokeShareLinksAddress = ref('');

// Multi-action mode state
const checkedRowKeys = ref([]);
const showMultiActionModal = ref(false);
const multiActionProgress = ref({ percentage: 0, tip: '0/0' });
const multiActionTitle = ref('');

const selectedCount = computed(() => checkedRowKeys.value.length);
const showMultiActionBar = computed(() => checkedRowKeys.value.length > 0);

const addressQuery = ref("")
const labelFilter = ref([])
const addressLabelOptions = ref([])
const showLabelManagement = ref(false)
const deletingLabel = ref("")
const sortBy = ref("")
const sortOrder = ref("")

const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)
const showDeleteAccount = ref(false)
const showClearInbox = ref(false)
const showClearSentItems = ref(false)

const showCredential = async (row) => {
    try {
        curEmailAddress.value = row.name
        curRotateCredentialAddressId.value = row.id
        curRotateCredentialAddress.value = row.name
        curEmailCredential.value = await api.adminShowAddressCredential(row.id)
        showEmailCredential.value = true
    } catch (error) {
        message.error(error.message || "error");
        showEmailCredential.value = false
        curEmailCredential.value = ""
        curEmailAddress.value = ""
    }
}

const deleteEmail = async () => {
    try {
        await api.adminDeleteAddress(curDeleteAddressId.value)
        message.success(t("success"));
        await fetchData()
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showDeleteAccount.value = false
    }
}

const clearInbox = async () => {
    try {
        await api.fetch(`/api/admin/clear_inbox/${curClearInboxAddressId.value}`, {
            method: 'DELETE'
        });
        message.success(t("success"));
        await fetchData()
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showClearInbox.value = false
    }
}

const clearSentItems = async () => {
    try {
        await api.fetch(`/api/admin/clear_sent_items/${curClearSentItemsAddressId.value}`, {
            method: 'DELETE'
        });
        message.success(t("success"));
        await fetchData()
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showClearSentItems.value = false
    }
}

const resetPassword = async () => {
    const normalizedPassword = newPassword.value.trim()
    if (!normalizedPassword) {
        message.error(t("newPassword"));
        return;
    }
    try {
        await api.fetch(`/api/admin/address/${curResetPasswordAddressId.value}/reset_password`, {
            method: 'POST',
            body: JSON.stringify({
                password: await hashPassword(normalizedPassword)
            })
        });
        message.success(t("passwordResetSuccess"));
        newPassword.value = '';
        showResetPassword.value = false;
    } catch (error) {
        message.error(error.message || "error");
    }
}

const rotateCredential = async () => {
    try {
        const res = await api.fetch(`/api/admin/address/${curRotateCredentialAddressId.value}/rotate_credential`, {
            method: 'POST'
        });
        curEmailAddress.value = res.address || curRotateCredentialAddress.value;
        curEmailCredential.value = res.jwt;
        showRotateCredential.value = false;
        showEmailCredential.value = true;
        message.success(t("credentialRotated"));
        await fetchData();
    } catch (error) {
        message.error(error.message || "error");
    }
}

const revokeShareLinks = async () => {
    try {
        await api.fetch(`/api/admin/address/${curRevokeShareLinksAddressId.value}/share_tokens`, {
            method: 'DELETE'
        });
        showRevokeShareLinks.value = false;
        message.success(t("shareLinksRevoked"));
        if (showShareTokenList.value && curRevokeShareLinksAddressId.value === shareTokenAddressId.value) {
            await fetchShareTokenRecords(shareTokenAddressId.value);
        }
        await fetchData();
    } catch (error) {
        message.error(error.message || "error");
    }
}

const copyText = async (text) => {
    if (!text) return
    try {
        await navigator.clipboard.writeText(text)
        message.success(t('copySuccess'))
    } catch (error) {
        console.error(error)
        message.error(t('copyFailed'))
    }
}

const renderCopyButton = (text) => h(NTooltip, { trigger: 'hover' }, {
    trigger: () => h(NButton, {
        text: true,
        size: 'tiny',
        class: 'copy-icon-button',
        'aria-label': t('copyAddress'),
        onClick: () => copyText(text)
    }, {
        icon: () => h(NIcon, null, { default: () => h(ContentCopyOutlined) })
    }),
    default: () => t('copyAddress')
})

const renderEditMetadataButton = (row) => h(NTooltip, { trigger: 'hover' }, {
    trigger: () => h(NButton, {
        text: true,
        size: 'tiny',
        class: 'metadata-edit-button',
        'aria-label': t('editMetadata'),
        onClick: () => openEditAddress(row)
    }, {
        icon: () => h(NIcon, null, { default: () => h(EditOutlined) })
    }),
    default: () => t('editMetadata')
})

const buildAddressActionOptions = (row) => ([
    { label: t('editAddress'), key: 'edit' },
    { label: t('credentialManagement'), key: 'credential' },
    { label: t('shareManagement'), key: 'share' },
    row.mail_count > 0 ? { label: t('viewMails'), key: 'mails' } : null,
    row.send_count > 0 ? { label: t('viewSendBox'), key: 'sendBox' } : null,
    { type: 'divider', key: 'divider' },
    row.mail_count > 0 ? { label: t('clearInbox'), key: 'clearInbox' } : null,
    row.send_count > 0 ? { label: t('clearSentItems'), key: 'clearSentItems' } : null,
    openSettings.value?.enableAddressPassword ? { label: t('resetPassword'), key: 'resetPassword' } : null,
    { label: t('delete'), key: 'delete' },
]).filter(Boolean)

const handleAddressActionSelect = (key, row) => {
    if (key === 'edit') {
        openEditAddress(row)
        return
    }
    if (key === 'credential') {
        showCredential(row)
        return
    }
    if (key === 'share') {
        openShareManagement(row)
        return
    }
    if (key === 'mails') {
        adminMailTabAddress.value = row.name
        adminTab.value = "mails"
        return
    }
    if (key === 'sendBox') {
        adminSendBoxTabAddress.value = row.name
        adminMailsTab.value = "sendBox"
        adminTab.value = "mails"
        return
    }
    if (key === 'clearInbox') {
        curClearInboxAddressId.value = row.id
        showClearInbox.value = true
        return
    }
    if (key === 'clearSentItems') {
        curClearSentItemsAddressId.value = row.id
        showClearSentItems.value = true
        return
    }
    if (key === 'resetPassword') {
        curResetPasswordAddressId.value = row.id
        showResetPassword.value = true
        return
    }
    if (key === 'delete') {
        curDeleteAddressId.value = row.id
        showDeleteAccount.value = true
    }
}

const renderActionMenuButton = (row) => h('div', { class: 'action-menu-cell' }, [
    h(NDropdown, {
        trigger: 'click',
        placement: 'bottom-end',
        options: buildAddressActionOptions(row),
        onSelect: (key) => handleAddressActionSelect(key, row),
    }, {
        default: () => h(NButton, {
            quaternary: true,
            circle: true,
            size: 'small',
            class: 'action-menu-trigger',
            'aria-label': t('actions'),
        }, {
            icon: () => h(NIcon, null, { default: () => h(MenuFilled) })
        })
    })
])

const formatD1DateTime = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const pad = (value) => String(value).padStart(2, '0');
    return [
        date.getUTCFullYear(),
        pad(date.getUTCMonth() + 1),
        pad(date.getUTCDate()),
    ].join('-') + ' ' + [
        pad(date.getUTCHours()),
        pad(date.getUTCMinutes()),
        pad(date.getUTCSeconds()),
    ].join(':');
}

const openCreateShareLink = (row) => {
    shareLinkForm.value = {
        addressId: row.id,
        address: row.name,
        label: '',
        expiresAt: null,
    };
    showCreateShareLink.value = true;
}

const openShareManagement = async (row) => {
    latestShareLink.value = '';
    shareLinkForm.value = {
        addressId: row.id,
        address: row.name,
        label: '',
        expiresAt: null,
    };
    curRevokeShareLinksAddressId.value = row.id;
    curRevokeShareLinksAddress.value = row.name;
    await openShareTokenList(row);
}

const createShareLink = async () => {
    try {
        const res = await api.fetch(`/api/admin/address/${shareLinkForm.value.addressId}/share_tokens`, {
            method: 'POST',
            body: JSON.stringify({
                label: shareLinkForm.value.label || '',
                scopes: ['read'],
                expires_at: formatD1DateTime(shareLinkForm.value.expiresAt),
            })
        });
        curShareAddress.value = shareLinkForm.value.address;
        curShareLink.value = `${window.location.origin}/i/${encodeURIComponent(res.token)}`;
        latestShareLink.value = curShareLink.value;
        showCreateShareLink.value = false;
        showShareLink.value = !showShareTokenList.value;
        await copyText(curShareLink.value);
        if (showShareTokenList.value && shareTokenAddressId.value === shareLinkForm.value.addressId) {
            await fetchShareTokenRecords(shareLinkForm.value.addressId);
        }
        await fetchData();
    } catch (error) {
        message.error(error.message || "error");
    }
}

const openEditAddress = (row) => {
    const rowLabels = getRowLabels(row);
    editAddressForm.value = {
        id: row.id,
        name: row.name,
        display_label: rowLabels[0] || row.display_label || '',
        labels: rowLabels,
        owner_note: row.owner_note || '',
    };
    showEditAddress.value = true;
}

const saveAddressMetadata = async () => {
    try {
        await api.fetch(`/api/admin/address/${editAddressForm.value.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                display_label: editAddressForm.value.display_label,
                labels: editAddressForm.value.labels,
                owner_note: editAddressForm.value.owner_note,
            })
        });
        message.success(t("success"));
        showEditAddress.value = false;
        await fetchAddressLabelOptions();
        await fetchData();
    } catch (error) {
        message.error(error.message || "error");
    }
}

const fetchAddressLabelOptions = async () => {
    try {
        const { results } = await api.fetch(`/api/admin/address_labels`);
        addressLabelOptions.value = (results || []).map((option) => ({
            ...option,
            label: option.value,
        }));
    } catch (error) {
        console.error(error);
    }
}

const deleteAddressLabel = async (label) => {
    if (!label) return;
    try {
        deletingLabel.value = label;
        await api.fetch('/api/admin/address_labels', {
            method: 'DELETE',
            body: JSON.stringify({ label })
        });
        labelFilter.value = labelFilter.value.filter((item) => item !== label);
        message.success(t('labelDeleted'));
        await fetchAddressLabelOptions();
        await fetchData();
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        deletingLabel.value = "";
    }
}

const fetchShareTokenRecords = async (addressId) => {
    const { results } = await api.fetch(`/api/admin/address/${addressId}/share_tokens`);
    shareTokenRecords.value = results || [];
}

const openShareTokenList = async (row) => {
    try {
        shareTokenAddressId.value = row.id;
        shareTokenAddress.value = row.name;
        await fetchShareTokenRecords(row.id);
        showShareTokenList.value = true;
    } catch (error) {
        message.error(error.message || "error");
    }
}

const revokeShareToken = async (tokenId) => {
    try {
        await api.fetch(`/api/admin/address_share_tokens/${tokenId}`, {
            method: 'DELETE'
        });
        message.success(t("success"));
        await fetchShareTokenRecords(shareTokenAddressId.value);
        await fetchData();
    } catch (error) {
        message.error(error.message || "error");
    }
}

const parseD1DateTimeToLocalTimestamp = (timestamp) => {
    if (!timestamp) return null;
    const time = Date.parse(`${String(timestamp).replace(' ', 'T')}Z`);
    return Number.isFinite(time) ? time : null;
}

const openEditShareToken = (row) => {
    editShareTokenForm.value = {
        id: row.id,
        label: row.label || '',
        expiresAt: parseD1DateTimeToLocalTimestamp(row.expires_at),
    };
    showEditShareToken.value = true;
}

const saveShareToken = async () => {
    try {
        await api.fetch(`/api/admin/address_share_tokens/${editShareTokenForm.value.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                label: editShareTokenForm.value.label || '',
                expires_at: formatD1DateTime(editShareTokenForm.value.expiresAt),
                scopes: ['read'],
            })
        });
        showEditShareToken.value = false;
        message.success(t("success"));
        await fetchShareTokenRecords(shareTokenAddressId.value);
    } catch (error) {
        message.error(error.message || "error");
    }
}

const getShareTokenStatus = (row) => {
    if (row.revoked_at) return t('revoked');
    if (row.expires_at && new Date(`${row.expires_at.replace(' ', 'T')}Z`).getTime() <= Date.now()) {
        return t('expired');
    }
    return t('active');
}

// Multi-action mode functions
const multiActionSelectAll = () => {
    checkedRowKeys.value = data.value.map(item => item.id);
}

const multiActionUnselectAll = () => {
    checkedRowKeys.value = [];
}

// 通用批量操作函数
const executeBatchOperation = async ({
    shouldSkip = () => false,
    apiCall,
    title,
    operationName = 'operation'
}) => {
    try {
        loading.value = true;
        const selectedAddresses = data.value.filter((item) =>
            checkedRowKeys.value.includes(item.id)
        );

        if (selectedAddresses.length === 0) {
            message.error(t('pleaseSelectAddress'));
            return;
        }

        const failedIds = [];
        const totalCount = selectedAddresses.length;

        multiActionProgress.value = {
            percentage: 0,
            tip: `0/${totalCount}`
        };
        multiActionTitle.value = title;
        showMultiActionModal.value = true;

        for (const [index, address] of selectedAddresses.entries()) {
            try {
                if (!shouldSkip(address)) {
                    await apiCall(address.id);
                }
            } catch (error) {
                console.error(`${operationName} failed for address ${address.id}:`, error);
                failedIds.push(address.id);
            }
            multiActionProgress.value = {
                percentage: Math.floor((index + 1) / totalCount * 100),
                tip: `${index + 1}/${totalCount}`
            };
        }

        await fetchData();
        checkedRowKeys.value = failedIds;
        message.success(t("success"));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        loading.value = false;
    }
}

const multiActionDeleteAccounts = async () => {
    await executeBatchOperation({
        apiCall: (id) => api.adminDeleteAddress(id),
        title: t('multiDelete') + ' ' + t('success'),
        operationName: 'Delete'
    });
}

const multiActionClearInbox = async () => {
    await executeBatchOperation({
        shouldSkip: (address) => address.mail_count <= 0,
        apiCall: (id) => api.fetch(`/api/admin/clear_inbox/${id}`, {
            method: 'DELETE'
        }),
        title: t('multiClearInbox') + ' ' + t('success'),
        operationName: 'ClearInbox'
    });
}

const multiActionClearSentItems = async () => {
    await executeBatchOperation({
        shouldSkip: (address) => address.send_count <= 0,
        apiCall: (id) => api.fetch(`/api/admin/clear_sent_items/${id}`, {
            method: 'DELETE'
        }),
        title: t('multiClearSentItems') + ' ' + t('success'),
        operationName: 'ClearSentItems'
    });
}

const fetchData = async () => {
    try {
        addressQuery.value = addressQuery.value.trim()
        const params = new URLSearchParams({
            limit: String(pageSize.value),
            offset: String((page.value - 1) * pageSize.value),
        });
        if (addressQuery.value) params.set('query', addressQuery.value);
        if (Array.isArray(labelFilter.value) && labelFilter.value.length > 0) {
            params.set('label', labelFilter.value.join(','));
        }
        if (sortBy.value) params.set('sort_by', sortBy.value);
        if (sortOrder.value) params.set('sort_order', sortOrder.value);
        const { results, count: addressCount } = await api.fetch(`/api/admin/address?${params.toString()}`);
        data.value = results;
        if (page.value === 1 || addressCount > 0) {
            count.value = addressCount ?? 0;
        }
    } catch (error) {
        console.error(error);
        message.error(error.message || "error");
    }
}

const sourceMetaContent = (row) => {
    const val = row.source_meta;
    if (!val) return '-';
    const text = String(val);
    const shortText = text.length > 24 ? `${text.slice(0, 22)}...` : text;
    const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    const ipv6Regex = /^[0-9a-fA-F:]+$/;
    const props = {
        class: 'source-meta',
        title: text,
    };
    if (ipv4Regex.test(text) || (text.includes(':') && ipv6Regex.test(text) && !text.startsWith('tg:'))) {
        return h('a', {
            ...props,
            href: `https://ip.im/${text}`,
            target: '_blank',
            rel: 'noopener noreferrer'
        }, shortText);
    }
    return h('span', props, shortText);
}

const getRowLabels = (row) => {
    if (Array.isArray(row.labels) && row.labels.length > 0) {
        return row.labels
            .map((label) => typeof label === 'string' ? label : label?.name)
            .filter(Boolean);
    }
    return row.display_label ? [row.display_label] : [];
}

const renderActivityButton = ({ count, label, type, onClick }) => {
    const value = Number(count || 0);
    const button = h(NButton,
        {
            text: true,
            size: "small",
            disabled: value <= 0,
            class: "activity-button",
            onClick: () => {
                if (value > 0 && onClick) onClick();
            }
        },
        {
            default: () => [
                h(NTag, {
                    size: 'small',
                    bordered: false,
                    type: value > 0 ? type : 'default'
                }, {
                    default: () => `${label} ${value}`
                })
            ]
        }
    )
    const tooltip = value > 0 && onClick
        ? (label === t('shareShort') ? t('viewShareLinks') : label)
        : '';
    if (!tooltip) return button;
    return h(NTooltip, { trigger: 'hover' }, {
        trigger: () => button,
        default: () => tooltip
    })
}

const searchData = () => {
    if (page.value === 1) {
        fetchData();
    } else {
        page.value = 1;
    }
}

const handleSorterChange = (sorter) => {
    sortBy.value = sorter.columnKey || "";
    sortOrder.value = sorter.order || "";
    if (page.value === 1) {
        fetchData();
    } else {
        page.value = 1;
    }
}

const columns = computed(() => [
    {
        type: 'selection',
        width: 48,
        fixed: 'left'
    },
    {
        title: "ID",
        key: "id",
        width: 72,
        align: "center",
        sorter: true,
        sortOrder: sortBy.value === 'id' ? sortOrder.value : false
    },
    {
        title: t('addressInfo'),
        key: "name",
        minWidth: 380,
        sorter: true,
        sortOrder: sortBy.value === 'name' ? sortOrder.value : false,
        render(row) {
            const note = row.owner_note || '';
            const rowLabels = getRowLabels(row);
            const visibleLabels = rowLabels.slice(0, 2);
            const hiddenLabelCount = Math.max(0, rowLabels.length - visibleLabels.length);
            const metadataChildren = [];
            if (rowLabels.length > 0) {
                metadataChildren.push(h('div', { class: 'address-labels' }, [
                    ...visibleLabels.map((label) =>
                        h(NTag, {
                            size: 'small',
                            type: 'success',
                            bordered: false,
                            class: 'address-label-chip',
                            title: label,
                            onClick: () => openEditAddress(row)
                        }, {
                            default: () => label
                        })
                    ),
                    hiddenLabelCount > 0
                        ? h(NTag, {
                            size: 'small',
                            bordered: false,
                            class: 'address-label-chip',
                            title: rowLabels.join(', '),
                            onClick: () => openEditAddress(row)
                        }, {
                            default: () => `+${hiddenLabelCount}`
                        })
                        : null
                ].filter(Boolean)));
            }
            if (note) {
                metadataChildren.push(h('button', {
                    class: 'address-note-chip',
                    title: note,
                    onClick: () => openEditAddress(row)
                }, note));
            }
            return h('div', { class: 'address-cell' }, [
                h('div', { class: 'address-primary' }, [
                    h('span', { class: 'address-name', title: row.name }, row.name),
                    renderCopyButton(row.name),
                    renderEditMetadataButton(row)
                ]),
                metadataChildren.length > 0
                    ? h('div', { class: 'address-details' }, metadataChildren)
                    : null,
                h('div', { class: 'address-meta' }, `${t('created_at')}: ${row.created_at || '-'}`)
            ].filter(Boolean));
        }
    },
    {
        title: t('updated_at'),
        key: "updated_at",
        width: 180,
        sorter: true,
        sortOrder: sortBy.value === 'updated_at' ? sortOrder.value : false
    },
    {
        title: t('source_meta'),
        key: "source_meta",
        width: 150,
        sorter: true,
        sortOrder: sortBy.value === 'source_meta' ? sortOrder.value : false,
        render(row) {
            return sourceMetaContent(row);
        }
    },
    {
        title: t('activity'),
        key: "activity",
        width: 260,
        render(row) {
            return h('div', { class: 'activity-cell' }, [
                renderActivityButton({
                    count: row.mail_count,
                    label: t('mailShort'),
                    type: "success",
                    onClick: () => {
                        if (row.mail_count > 0) {
                            adminMailTabAddress.value = row.name;
                            adminTab.value = "mails";
                        }
                    }
                }),
                renderActivityButton({
                    count: row.send_count,
                    label: t('sendShort'),
                    type: "warning",
                    onClick: () => {
                        if (row.send_count > 0) {
                            adminSendBoxTabAddress.value = row.name;
                            adminMailsTab.value = "sendBox";
                            adminTab.value = "mails";
                        }
                    }
                }),
                renderActivityButton({
                    count: row.active_share_token_count,
                    label: t('shareShort'),
                    type: "info",
                    onClick: () => openShareTokenList(row)
                })
            ]);
        }
    },
    {
        title: t('actions'),
        key: 'actions',
        width: 92,
        fixed: 'right',
        render(row) {
            return renderActionMenuButton(row)
        }
    }
])

const shareTokenColumns = computed(() => [
    {
        title: t('shareLabel'),
        key: "label",
    },
    {
        title: t('shareStatus'),
        key: "status",
        render(row) {
            return getShareTokenStatus(row);
        }
    },
    {
        title: t('expiresAt'),
        key: "expires_at",
        render(row) {
            return row.expires_at || '-';
        }
    },
    {
        title: t('lastUsedAt'),
        key: "last_used_at",
        render(row) {
            return row.last_used_at || '-';
        }
    },
    {
        title: t('created_at'),
        key: "created_at",
    },
    {
        title: t('actions'),
        key: "actions",
        width: 150,
        render(row) {
            return h('div', { class: 'share-token-actions' }, [
                h(NButton,
                    {
                        text: true,
                        type: "primary",
                        disabled: !!row.revoked_at,
                        onClick: () => openEditShareToken(row)
                    },
                    { default: () => t('editShareLink') }
                ),
                h(NButton,
                    {
                        text: true,
                        type: "error",
                        disabled: !!row.revoked_at,
                        onClick: () => revokeShareToken(row.id)
                    },
                    { default: () => t('revoke') }
                )
            ])
        }
    }
])

watch([page, pageSize], async () => {
    await fetchData()
})

onMounted(async () => {
    await fetchAddressLabelOptions()
    await fetchData()
})
</script>

<template>
    <div style="margin-top: 10px;">
        <AddressCredentialModal v-model:show="showEmailCredential" :address="curEmailAddress"
            :jwt="curEmailCredential">
            <template #actions>
                <n-popconfirm @positive-click="rotateCredential">
                    <template #trigger>
                        <n-button :loading="loading" size="small" tertiary type="warning">
                            {{ t('rotateCredential') }}
                        </n-button>
                    </template>
                    {{ t('rotateCredentialTip') }}
                </n-popconfirm>
            </template>
        </AddressCredentialModal>
        <n-modal v-model:show="showDeleteAccount" preset="dialog" :title="t('deleteAccount')">
            <p>{{ t('deleteTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="deleteEmail" size="small" tertiary type="error">
                    {{ t('deleteAccount') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showClearInbox" preset="dialog" :title="t('clearInbox')">
            <p>{{ t('clearInboxTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="clearInbox" size="small" tertiary type="error">
                    {{ t('clearInbox') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showClearSentItems" preset="dialog" :title="t('clearSentItems')">
            <p>{{ t('clearSentItemsTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="clearSentItems" size="small" tertiary type="error">
                    {{ t('clearSentItems') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showResetPassword" preset="dialog" :title="t('resetPassword')">
            <n-form-item :label="t('newPassword')">
                <n-input v-model:value="newPassword" type="password" placeholder="" show-password-on="click"
                    @keyup.enter="resetPassword" />
            </n-form-item>
            <template #action>
                <n-button :loading="loading" @click="resetPassword" size="small" tertiary type="info">
                    {{ t('resetPassword') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showEditAddress" preset="dialog" :title="t('editAddress')">
            <n-form label-placement="top">
                <n-form-item :label="t('name')">
                    <n-input :value="editAddressForm.name" disabled />
                </n-form-item>
                <n-form-item :label="t('displayLabel')">
                    <n-select v-model:value="editAddressForm.labels" :options="addressLabelOptions" multiple tag
                        filterable clearable />
                </n-form-item>
                <n-form-item :label="t('ownerNote')">
                    <n-input v-model:value="editAddressForm.owner_note" type="textarea" maxlength="1024" show-count
                        clearable />
                </n-form-item>
            </n-form>
            <template #action>
                <n-button :loading="loading" @click="saveAddressMetadata" size="small" tertiary type="primary">
                    {{ t('save') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showLabelManagement" preset="card" :title="t('labelManagement')"
            style="width: min(620px, calc(100vw - 32px));">
            <n-space vertical>
                <n-alert type="info" :show-icon="false" :bordered="false">
                    {{ t('labelManagementTip') }}
                </n-alert>
                <n-empty v-if="addressLabelOptions.length === 0" :description="t('noAvailableLabels')" />
                <n-list v-else bordered>
                    <n-list-item v-for="option in addressLabelOptions" :key="option.value">
                        <div class="label-management-row">
                            <n-tag type="success" :bordered="false">
                                {{ option.value }}
                            </n-tag>
                            <span class="label-management-count">
                                {{ option.usage_count || 0 }} {{ t('addressUnit') }}
                            </span>
                        </div>
                        <template #suffix>
                            <n-popconfirm @positive-click="deleteAddressLabel(option.value)">
                                <template #trigger>
                                    <n-button size="small" tertiary type="error"
                                        :loading="deletingLabel === option.value">
                                        {{ t('deleteLabel') }}
                                    </n-button>
                                </template>
                                {{ t('deleteLabelTip') }}
                            </n-popconfirm>
                        </template>
                    </n-list-item>
                </n-list>
            </n-space>
        </n-modal>
        <n-modal v-model:show="showCreateShareLink" preset="dialog" :title="t('createShareLink')">
            <n-form label-placement="top">
                <n-form-item :label="t('name')">
                    <n-input :value="shareLinkForm.address" disabled />
                </n-form-item>
                <n-form-item :label="t('shareLabel')">
                    <n-input v-model:value="shareLinkForm.label" maxlength="128" show-count clearable />
                </n-form-item>
                <n-form-item :label="t('expiresAt')">
                    <n-date-picker v-model:value="shareLinkForm.expiresAt" type="datetime" clearable
                        style="width: 100%;" />
                </n-form-item>
            </n-form>
            <template #action>
                <n-button :loading="loading" @click="createShareLink" size="small" tertiary type="primary">
                    {{ t('createShareLink') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showShareTokenList" preset="card" :title="t('shareRecords')"
            style="width: min(900px, calc(100vw - 32px));">
            <n-space vertical size="large">
                <div class="share-management-address">
                    <span class="share-management-label">{{ t('name') }}</span>
                    <code>{{ shareTokenAddress }}</code>
                </div>
                <section class="share-section">
                    <div class="share-section-header">
                        <h3>{{ t('createShareLink') }}</h3>
                        <span>{{ t('createShareLinkTip') }}</span>
                    </div>
                    <n-form label-placement="top">
                        <n-grid :cols="3" :x-gap="12" :y-gap="8" responsive="screen">
                            <n-form-item-gi :span="1" :label="t('shareLabel')">
                                <n-input v-model:value="shareLinkForm.label" maxlength="128" show-count clearable />
                            </n-form-item-gi>
                            <n-form-item-gi :span="1" :label="t('expiresAt')">
                                <n-date-picker v-model:value="shareLinkForm.expiresAt" type="datetime" clearable
                                    style="width: 100%;" />
                            </n-form-item-gi>
                            <n-form-item-gi :span="1" :label="t('actions')">
                                <n-space>
                                    <n-button :loading="loading" @click="createShareLink" size="small" tertiary
                                        type="primary">
                                        {{ t('createShareLink') }}
                                    </n-button>
                                    <n-popconfirm @positive-click="revokeShareLinks">
                                        <template #trigger>
                                            <n-button size="small" tertiary type="error">
                                                {{ t('revokeShareLinks') }}
                                            </n-button>
                                        </template>
                                        {{ t('revokeShareLinksTip') }}
                                    </n-popconfirm>
                                </n-space>
                            </n-form-item-gi>
                        </n-grid>
                    </n-form>
                </section>
                <section v-if="latestShareLink" class="share-section share-latest-section">
                    <div class="share-section-header">
                        <h3>{{ t('latestShareLink') }}</h3>
                        <span>{{ t('latestShareLinkTip') }}</span>
                    </div>
                    <div class="share-latest-row">
                        <code class="share-link-code">{{ latestShareLink }}</code>
                        <n-button @click="copyText(latestShareLink)" size="small" tertiary type="primary">
                            {{ t('copyShareLink') }}
                        </n-button>
                    </div>
                </section>
                <section class="share-section">
                    <div class="share-section-header">
                        <h3>{{ t('shareRecords') }}</h3>
                        <span>{{ t('shareRecordsTip') }}</span>
                    </div>
                    <n-data-table :columns="shareTokenColumns" :data="shareTokenRecords" :bordered="false" embedded
                        :scroll-x="760" />
                </section>
            </n-space>
        </n-modal>
        <n-modal v-model:show="showEditShareToken" preset="dialog" :title="t('editShareLink')">
            <n-form label-placement="top">
                <n-form-item :label="t('shareLabel')">
                    <n-input v-model:value="editShareTokenForm.label" maxlength="128" show-count clearable />
                </n-form-item>
                <n-form-item :label="t('expiresAt')">
                    <n-date-picker v-model:value="editShareTokenForm.expiresAt" type="datetime" clearable
                        style="width: 100%;" />
                </n-form-item>
            </n-form>
            <template #action>
                <n-button :loading="loading" @click="saveShareToken" size="small" tertiary type="primary">
                    {{ t('save') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showRotateCredential" preset="dialog" :title="t('rotateCredential')">
            <p>{{ t('rotateCredentialTip') }}</p>
            <n-text>{{ curRotateCredentialAddress }}</n-text>
            <template #action>
                <n-button :loading="loading" @click="rotateCredential" size="small" tertiary type="warning">
                    {{ t('rotateCredential') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showRevokeShareLinks" preset="dialog" :title="t('revokeShareLinks')">
            <p>{{ t('revokeShareLinksTip') }}</p>
            <n-text>{{ curRevokeShareLinksAddress }}</n-text>
            <template #action>
                <n-button :loading="loading" @click="revokeShareLinks" size="small" tertiary type="error">
                    {{ t('revokeShareLinks') }}
                </n-button>
            </template>
        </n-modal>
        <n-modal v-model:show="showShareLink" preset="dialog" :title="t('shareLink')">
            <n-space vertical>
                <n-text>{{ curShareAddress }}</n-text>
                <code class="share-link-code">{{ curShareLink }}</code>
            </n-space>
            <template #action>
                <n-button @click="copyText(curShareLink)" size="small" tertiary type="primary">
                    {{ t('copyShareLink') }}
                </n-button>
            </template>
        </n-modal>
        <n-input-group style="margin-bottom: 10px;">
            <n-input v-model:value="addressQuery" clearable :placeholder="t('addressQueryTip')"
                @keydown.enter="searchData" />
            <n-select v-model:value="labelFilter" :options="addressLabelOptions" clearable filterable multiple
                :placeholder="t('labelFilter')" style="max-width: 220px;" @update:value="searchData" />
            <n-button @click="showLabelManagement = true" tertiary>
                <template #icon>
                    <n-icon>
                        <LabelOutlined />
                    </n-icon>
                </template>
                {{ t('labelManagement') }}
            </n-button>
            <n-button @click="searchData" type="primary" tertiary>
                {{ t('query') }}
            </n-button>
        </n-input-group>

        <n-space v-if="showMultiActionBar" style="margin-bottom: 10px;">
            <n-button @click="multiActionSelectAll" tertiary>
                {{ t('selectAll') }}
            </n-button>
            <n-button @click="multiActionUnselectAll" tertiary>
                {{ t('unselectAll') }}
            </n-button>
            <n-popconfirm @positive-click="multiActionDeleteAccounts">
                <template #trigger>
                    <n-button tertiary type="error">{{ t('multiDelete') }}</n-button>
                </template>
                {{ t('multiDeleteTip') }}
            </n-popconfirm>
            <n-popconfirm @positive-click="multiActionClearInbox">
                <template #trigger>
                    <n-button tertiary type="warning">{{ t('multiClearInbox') }}</n-button>
                </template>
                {{ t('multiClearInboxTip') }}
            </n-popconfirm>
            <n-popconfirm @positive-click="multiActionClearSentItems">
                <template #trigger>
                    <n-button tertiary type="warning">{{ t('multiClearSentItems') }}</n-button>
                </template>
                {{ t('multiClearSentItemsTip') }}
            </n-popconfirm>
            <n-tag type="info">
                {{ t('selectedItems') }}: {{ selectedCount }}
            </n-tag>
        </n-space>
        <div style="overflow: auto;">
            <div style="display: inline-block;">
                <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
                    :page-sizes="[20, 50, 100]" show-size-picker>
                    <template #prefix="{ itemCount }">
                        {{ t('itemCount') }}: {{ itemCount }}
                    </template>
                </n-pagination>
            </div>
            <n-data-table v-model:checked-row-keys="checkedRowKeys" :columns="columns" :data="data" :bordered="false"
                :row-key="row => row.id" remote @update:sorter="handleSorterChange" embedded />
        </div>

        <!-- Multi-action progress modal -->
        <n-modal v-model:show="showMultiActionModal" preset="dialog" :title="multiActionTitle" negative-text="OK">
            <n-space justify="center">
                <n-progress type="circle" status="info" :percentage="multiActionProgress.percentage">
                    <span style="text-align: center">
                        {{ multiActionProgress.tip }}
                    </span>
                </n-progress>
            </n-space>
        </n-modal>

    </div>
</template>

<style scoped>
.n-pagination {
    margin-top: 10px;
    margin-bottom: 10px;
}

.n-data-table {
    min-width: 1080px;
}

.address-cell {
    min-width: 0;
}

.address-primary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.address-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
}

.address-details {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    min-width: 0;
    max-width: 100%;
}

.address-labels {
    display: flex;
    flex-wrap: nowrap;
    gap: 4px;
    min-width: 0;
    max-width: 52%;
}

.address-label-chip {
    max-width: 112px;
    cursor: pointer;
}

.address-label-chip :deep(.n-tag__content) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.address-note-chip {
    min-width: 0;
    max-width: 180px;
    overflow: hidden;
    border: 0;
    border-radius: 4px;
    padding: 2px 6px;
    background: var(--n-color-embedded);
    color: var(--n-text-color-2);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    line-height: 1.5;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.address-note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--n-text-color-2);
}

.muted {
    color: var(--n-text-color-3);
}

.address-meta {
    margin-top: 4px;
    color: var(--n-text-color-3);
    font-size: 12px;
}

.activity-cell {
    display: flex;
    align-items: center;
    gap: 10px;
}

.activity-button {
    min-width: 64px;
}

.activity-button:not(.n-button--disabled),
.copy-icon-button,
.metadata-edit-button,
.action-menu-trigger {
    cursor: pointer;
}

.activity-button.n-button--disabled {
    cursor: default;
}

.copy-icon-button {
    opacity: 0.68;
}

.metadata-edit-button {
    opacity: 0.62;
}

.action-menu-cell {
    display: flex;
    align-items: center;
    justify-content: center;
}

.action-menu-trigger {
    color: var(--n-text-color-2);
}

.address-primary:hover .copy-icon-button,
.address-primary:hover .metadata-edit-button,
.copy-icon-button:focus-visible,
.metadata-edit-button:focus-visible {
    opacity: 1;
}

.source-meta {
    display: inline-block;
    max-width: 128px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.share-link-code {
    display: block;
    overflow-wrap: anywhere;
    border-radius: 6px;
    padding: 8px;
    background: var(--n-color-embedded);
}

.label-management-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
}

.label-management-count {
    color: var(--n-text-color-3);
    font-size: 12px;
}

.share-management-address {
    display: grid;
    gap: 6px;
}

.share-management-label {
    color: var(--n-text-color-3);
    font-size: 12px;
}

.share-management-address code {
    overflow-wrap: anywhere;
    border-radius: 6px;
    padding: 8px;
    background: var(--n-color-embedded);
}

.share-section {
    border: 1px solid var(--n-border-color);
    border-radius: 8px;
    padding: 14px;
    overflow: hidden;
}

.share-section-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.share-section-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
}

.share-section-header span {
    color: var(--n-text-color-3);
    font-size: 12px;
}

.share-latest-section {
    border-color: rgba(24, 160, 88, 0.35);
    background: rgba(24, 160, 88, 0.05);
}

.share-latest-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
}

.share-token-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

@media (max-width: 720px) {
    .address-labels {
        max-width: 100%;
    }

    .share-section-header,
    .share-latest-row {
        grid-template-columns: 1fr;
        display: grid;
    }
}
</style>
