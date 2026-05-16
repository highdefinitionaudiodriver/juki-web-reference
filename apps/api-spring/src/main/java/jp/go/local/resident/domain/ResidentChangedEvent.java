package jp.go.local.resident.domain;

/**
 * Resident への変更が確定したことを通知するイベント。
 * Controller / Service で `ApplicationEventPublisher.publishEvent` する。
 * {@link jp.go.local.resident.authz.HistoryWriter} が拾って resident_history に書き込む。
 */
public record ResidentChangedEvent(String residentId, String transactionId, String reasonCode) {}
