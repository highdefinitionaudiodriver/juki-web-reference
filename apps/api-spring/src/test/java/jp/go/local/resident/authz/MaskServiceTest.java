package jp.go.local.resident.authz;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import jp.go.local.resident.domain.JuminCode;
import jp.go.local.resident.domain.MyNumber;
import jp.go.local.resident.domain.Resident;
import jp.go.local.resident.repository.JuminCodeRepository;
import jp.go.local.resident.repository.MyNumberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

class MaskServiceTest {

    private final JuminCodeRepository juminCodeRepository = org.mockito.Mockito.mock(JuminCodeRepository.class);
    private final MyNumberRepository myNumberRepository = org.mockito.Mockito.mock(MyNumberRepository.class);
    private final MaskService maskService = new MaskService(juminCodeRepository, myNumberRepository);

    @Test
    void restrictedResidentIsHiddenFromWindowRole() {
        Resident resident = resident(true);

        assertThat(maskService.applyResidentMask(resident, auth("WINDOW"))).isNull();
        assertThat(maskService.applyResidentMask(resident, auth("RESTRICTION_RELEASE"))).isNotNull();
    }

    @Test
    void sensitiveCodesAreMaskedUnlessPrivilegedAndRequested() {
        Resident resident = resident(false);
        when(juminCodeRepository.findCurrentByResidentId("R001"))
            .thenReturn(Optional.of(new JuminCode(1L, "R001", "12345678901", LocalDate.now(), null, "ISSUE")));
        when(myNumberRepository.findCurrentByResidentId("R001"))
            .thenReturn(Optional.of(new MyNumber(1L, "R001", "enc:abcd", LocalDate.now(), null, "ISSUE")));

        Map<String, Object> window = maskService.toResponse(resident, auth("WINDOW"), List.of("my_number", "jumin_code"));
        assertThat(window.get("myNumber")).isEqualTo("**** **** ****");
        assertThat(window.get("juminCode")).isEqualTo("**** **** ***");

        Map<String, Object> admin = maskService.toResponse(resident, auth("ADMIN"), List.of("my_number", "jumin_code"));
        assertThat(admin.get("myNumber")).isEqualTo("enc:abcd");
        assertThat(admin.get("juminCode")).isEqualTo("12345678901");
    }

    @Test
    void reviewRoleCanUnmaskSensitiveCodesWhenRequested() {
        Resident resident = resident(false);
        when(juminCodeRepository.findCurrentByResidentId("R001"))
            .thenReturn(Optional.of(new JuminCode(1L, "R001", "12345678901", LocalDate.now(), null, "ISSUE")));
        when(myNumberRepository.findCurrentByResidentId("R001"))
            .thenReturn(Optional.of(new MyNumber(1L, "R001", "enc:abcd", LocalDate.now(), null, "ISSUE")));

        Map<String, Object> response = maskService.toResponse(resident, auth("REVIEW"), List.of("my_number", "jumin_code"));

        assertThat(response.get("myNumber")).isEqualTo("enc:abcd");
        assertThat(response.get("juminCode")).isEqualTo("12345678901");
    }

    @Test
    void adminStillSeesMaskedCodesWhenUnmaskWasNotRequested() {
        Resident resident = resident(false);

        Map<String, Object> response = maskService.toResponse(resident, auth("ADMIN"), List.of());

        assertThat(response.get("myNumber")).isEqualTo("**** **** ****");
        assertThat(response.get("juminCode")).isEqualTo("**** **** ***");
    }

    @Test
    void toResponseReturnsNullForRestrictedResidentWithoutReleaseRole() {
        Resident resident = resident(true);

        assertThat(maskService.toResponse(resident, auth("WINDOW"), List.of("my_number", "jumin_code"))).isNull();
    }

    private Resident resident(boolean restricted) {
        return new Resident(
            "R001",
            "H001",
            "住民",
            "太郎",
            "ジュウミン",
            "タロウ",
            LocalDate.of(1985, 4, 1),
            "M",
            null,
            "132010001001",
            "東京都サンプル市1-1",
            LocalDate.of(2018, 6, 1),
            null,
            restricted,
            OffsetDateTime.now(),
            null
        );
    }

    private UsernamePasswordAuthenticationToken auth(String role) {
        return new UsernamePasswordAuthenticationToken(
            "u-test",
            "N/A",
            List.of(new SimpleGrantedAuthority("ROLE_" + role))
        );
    }
}
