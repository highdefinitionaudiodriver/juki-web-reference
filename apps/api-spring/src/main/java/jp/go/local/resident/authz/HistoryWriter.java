package jp.go.local.resident.authz;

import java.time.OffsetDateTime;
import jp.go.local.resident.domain.ResidentChangedEvent;
import jp.go.local.resident.repository.ResidentHistoryRepository;
import jp.go.local.resident.repository.ResidentRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 異動完了後に SCD-2 履歴を書き込むリスナ。
 * - AFTER_COMMIT に発火するため、ロールバック時には書かれない。
 * - 履歴書き込み自体は別トランザクションで実行（REQUIRES_NEW）。
 */
@Component
public class HistoryWriter {

    private final ResidentRepository residentRepository;
    private final ResidentHistoryRepository historyRepository;

    public HistoryWriter(ResidentRepository residentRepository, ResidentHistoryRepository historyRepository) {
        this.residentRepository = residentRepository;
        this.historyRepository = historyRepository;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onResidentChanged(ResidentChangedEvent event) {
        residentRepository.findById(event.residentId()).ifPresent(resident ->
            historyRepository.append(resident, event.transactionId(), OffsetDateTime.now())
        );
    }
}
