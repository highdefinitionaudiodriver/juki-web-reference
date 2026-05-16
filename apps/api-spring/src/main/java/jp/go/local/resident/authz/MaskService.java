package jp.go.local.resident.authz;

import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import jp.go.local.resident.domain.JuminCode;
import jp.go.local.resident.domain.MyNumber;
import jp.go.local.resident.domain.Resident;
import jp.go.local.resident.repository.JuminCodeRepository;
import jp.go.local.resident.repository.MyNumberRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

/**
 * 抑止対象隠蔽と項目別マスクのコア。
 *
 * 標準仕様書 10.3 / 10.4:
 * - 抑止対象（restricted_flag = true）は解除権限なしの利用者には存在自体を隠蔽。
 * - 個人番号・住民票コードは表示権限ロール（REVIEW/ADMIN）かつ明示的 unmask 要求のときのみ平文。
 * - 抑止対象の住所は支援措置によりマスク（解除権限がない場合は applyResidentMask が null を返すので
 *   そもそも住所まで到達しないが、Map ベースの応答では明示的にマスクすることがある）。
 */
@Service
public class MaskService {

    private static final String MASKED_JUMIN = "**** **** ***";
    private static final String MASKED_MY_NUMBER = "**** **** ****";

    private final JuminCodeRepository juminCodeRepository;
    private final MyNumberRepository myNumberRepository;

    public MaskService(JuminCodeRepository juminCodeRepository, MyNumberRepository myNumberRepository) {
        this.juminCodeRepository = juminCodeRepository;
        this.myNumberRepository = myNumberRepository;
    }

    public boolean canSeeRestricted(Authentication authentication) {
        Set<String> roles = roles(authentication);
        return roles.contains(Roles.RESTRICTION_RELEASE) || roles.contains(Roles.ADMIN);
    }

    public boolean canUnmaskSensitive(Authentication authentication) {
        Set<String> roles = roles(authentication);
        return roles.contains(Roles.REVIEW) || roles.contains(Roles.ADMIN);
    }

    public boolean hiddenByRestriction(Resident resident, Authentication authentication) {
        return resident != null && resident.restrictedFlag() && !canSeeRestricted(authentication);
    }

    /** Resident エンティティ自体は、抑止対象を null 化してドメインから消す（404 化用）。 */
    public Resident applyResidentMask(Resident resident, Authentication authentication) {
        if (resident == null) {
            return null;
        }
        if (hiddenByRestriction(resident, authentication)) {
            return null;
        }
        return resident;
    }

    /**
     * Resident をクライアント返却用 Map に整形。
     * - 抑止対象で見えない場合は null
     * - 個人番号・住民票コードはマスク／アンマスク制御
     *
     * @param unmask "myNumber" / "my_number" / "juminCode" / "jumin_code" のいずれかを含む
     */
    public Map<String, Object> toResponse(Resident resident, Authentication authentication, Collection<String> unmask) {
        if (applyResidentMask(resident, authentication) == null) {
            return null;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("residentId", resident.residentId());
        payload.put("householdId", resident.householdId());
        payload.put("familyNameKanji", resident.familyNameKanji());
        payload.put("givenNameKanji", resident.givenNameKanji());
        payload.put("familyNameKana", resident.familyNameKana());
        payload.put("givenNameKana", resident.givenNameKana());
        payload.put("birthDate", resident.birthDate());
        payload.put("sex", resident.sex());
        payload.put("addressCode", resident.addressCode());
        payload.put("addressText", resident.addressText());
        payload.put("movedInDate", resident.movedInDate());
        payload.put("movedOutDate", resident.movedOutDate());
        payload.put("nationality", resident.nationality());
        payload.put("validFrom", resident.validFrom());
        payload.put("validTo", resident.validTo());

        boolean wantsUnmaskJumin = matchesAny(unmask, "juminCode", "jumin_code") && canUnmaskSensitive(authentication);
        boolean wantsUnmaskMy = matchesAny(unmask, "myNumber", "my_number") && canUnmaskSensitive(authentication);

        payload.put("juminCode", wantsUnmaskJumin
            ? juminCodeRepository.findCurrentByResidentId(resident.residentId()).map(JuminCode::code).orElse(null)
            : MASKED_JUMIN);
        payload.put("myNumber", wantsUnmaskMy
            ? myNumberRepository.findCurrentByResidentId(resident.residentId()).map(MyNumber::numberCiphertext).orElse(null)
            : MASKED_MY_NUMBER);
        return payload;
    }

    private static boolean matchesAny(Collection<String> values, String... candidates) {
        if (values == null) return false;
        for (String candidate : candidates) {
            if (values.contains(candidate)) return true;
        }
        return false;
    }

    private Set<String> roles(Authentication authentication) {
        Set<String> roles = new HashSet<>();
        if (authentication == null) {
            return roles;
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof Jwt jwt) {
            List<String> claimRoles = jwt.getClaimAsStringList("roles");
            if (claimRoles != null) {
                roles.addAll(claimRoles);
            }
        }
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            String value = authority.getAuthority();
            roles.add(value.startsWith("ROLE_") ? value.substring("ROLE_".length()) : value);
        }
        return roles;
    }
}
