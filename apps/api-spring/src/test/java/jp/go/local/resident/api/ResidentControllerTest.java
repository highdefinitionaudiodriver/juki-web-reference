package jp.go.local.resident.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import jp.go.local.resident.authz.MaskService;
import jp.go.local.resident.domain.Resident;
import jp.go.local.resident.repository.ResidentHistoryRepository;
import jp.go.local.resident.repository.ResidentRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;

/**
 * ResidentController の MockMvc 単体テスト。
 *
 * Docker 不要で、検索条件・時点照会・unmask パラメータ・抑止 404・履歴を固定する。
 */
@WebMvcTest(controllers = ResidentController.class)
@org.springframework.context.annotation.Import(ResidentControllerTest.MockBeans.class)
class ResidentControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ResidentRepository repository;
    @Autowired ResidentHistoryRepository historyRepository;
    @Autowired MaskService maskService;

    @Test
    void search_passesPagingAndRestrictionFlagToRepository() throws Exception {
        Resident resident = resident(false);
        when(maskService.canSeeRestricted(any(Authentication.class))).thenReturn(false);
        when(repository.search("住民", false, false, 10, 10)).thenReturn(List.of(resident));
        when(maskService.toResponse(eq(resident), any(Authentication.class), eq(List.of()))).thenReturn(Map.of(
            "residentId", "R001",
            "familyNameKanji", "住民",
            "givenNameKanji", "太郎",
            "myNumber", "**** **** ****"
        ));

        mvc.perform(post("/api/v1/residents/search")
                .with(jwt().jwt(j -> j.claim("roles", List.of("WINDOW"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"住民\",\"page\":2,\"size\":10}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.page").value(2))
            .andExpect(jsonPath("$.items[0].residentId").value("R001"));
    }

    @Test
    void show_withAsOf_returnsHistorySnapshot() throws Exception {
        when(historyRepository.findSnapshotAt(eq("R001"), any(OffsetDateTime.class))).thenReturn(Optional.of(Map.of(
            "residentId", "R001",
            "addressText", "旧住所",
            "__transactionId", "TX-OLD"
        )));

        mvc.perform(get("/api/v1/residents/R001")
                .queryParam("asOf", "2026-05-01T00:00:00+09:00")
                .with(jwt().jwt(j -> j.claim("roles", List.of("REVIEW")))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.residentId").value("R001"))
            .andExpect(jsonPath("$.addressText").value("旧住所"))
            .andExpect(jsonPath("$.__transactionId").value("TX-OLD"));
    }

    @Test
    void show_withInvalidAsOf_returns400() throws Exception {
        mvc.perform(get("/api/v1/residents/R001")
                .queryParam("asOf", "not-a-date")
                .with(jwt().jwt(j -> j.claim("roles", List.of("REVIEW")))))
            .andExpect(status().isBadRequest());
    }

    @Test
    void show_withUnmaskPassesRequestedFieldsToMaskService() throws Exception {
        Resident resident = resident(false);
        when(repository.findById("R001")).thenReturn(Optional.of(resident));
        when(maskService.toResponse(eq(resident), any(Authentication.class), any())).thenReturn(Map.of(
            "residentId", "R001",
            "juminCode", "12345678901",
            "myNumber", "123456789018"
        ));

        mvc.perform(get("/api/v1/residents/R001")
                .queryParam("unmask", "jumin_code")
                .queryParam("unmask", "my_number")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN")))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.juminCode").value("12345678901"))
            .andExpect(jsonPath("$.myNumber").value("123456789018"));

        ArgumentCaptor<List<String>> captor = ArgumentCaptor.forClass(List.class);
        verify(maskService).toResponse(eq(resident), any(Authentication.class), captor.capture());
        org.assertj.core.api.Assertions.assertThat(captor.getValue()).containsExactly("jumin_code", "my_number");
    }

    @Test
    void show_whenMaskedByRestriction_returns404() throws Exception {
        Resident resident = resident(true);
        when(repository.findById("R001")).thenReturn(Optional.of(resident));
        when(maskService.toResponse(eq(resident), any(Authentication.class), eq(List.of()))).thenReturn(null);

        mvc.perform(get("/api/v1/residents/R001")
                .with(jwt().jwt(j -> j.claim("roles", List.of("WINDOW")))))
            .andExpect(status().isNotFound());
    }

    @Test
    void history_whenVisible_returnsTransactions() throws Exception {
        Resident resident = resident(false);
        when(repository.findById("R001")).thenReturn(Optional.of(resident));
        when(maskService.applyResidentMask(eq(resident), any(Authentication.class))).thenReturn(resident);
        when(historyRepository.listTransactions("R001")).thenReturn(List.of(Map.of(
            "transactionId", "TX-1",
            "typeCode", "ADDRESS_FIX"
        )));

        mvc.perform(get("/api/v1/residents/R001/history")
                .with(jwt().jwt(j -> j.claim("roles", List.of("WINDOW")))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].transactionId").value("TX-1"))
            .andExpect(jsonPath("$[0].typeCode").value("ADDRESS_FIX"));
    }

    @Test
    void patch_whenVisible_returnsAcceptedPatch() throws Exception {
        Resident resident = resident(false);
        when(repository.findById("R001")).thenReturn(Optional.of(resident));
        when(maskService.applyResidentMask(eq(resident), any(Authentication.class))).thenReturn(resident);

        mvc.perform(put("/api/v1/residents/R001")
                .with(jwt().jwt(j -> j.claim("roles", List.of("ADMIN"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"addressText\":\"東京都サンプル市中央町9-9\",\"reasonCode\":\"LIGHT_FIX\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.residentId").value("R001"))
            .andExpect(jsonPath("$.status").value("ACCEPTED"))
            .andExpect(jsonPath("$.patch.addressText").value("東京都サンプル市中央町9-9"))
            .andExpect(jsonPath("$.patch.reasonCode").value("LIGHT_FIX"));
    }

    @Test
    void patch_whenMaskedByRestriction_returns404() throws Exception {
        Resident resident = resident(true);
        when(repository.findById("R001")).thenReturn(Optional.of(resident));
        when(maskService.applyResidentMask(eq(resident), any(Authentication.class))).thenReturn(null);

        mvc.perform(put("/api/v1/residents/R001")
                .with(jwt().jwt(j -> j.claim("roles", List.of("WINDOW"))))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"addressText\":\"東京都サンプル市中央町9-9\"}"))
            .andExpect(status().isNotFound());
    }

    private static Resident resident(boolean restricted) {
        return new Resident(
            "R001",
            "H001",
            "住民",
            "太郎",
            "ジュウミン",
            "タロウ",
            LocalDate.parse("1985-04-01"),
            "M",
            "JPN",
            "1310000001",
            "東京都サンプル市中央町1-2-3",
            LocalDate.parse("2018-06-01"),
            null,
            restricted,
            OffsetDateTime.parse("2026-01-01T00:00:00+09:00"),
            null
        );
    }

    @TestConfiguration
    static class MockBeans {
        @Bean ResidentRepository residentRepository() { return mock(ResidentRepository.class); }
        @Bean ResidentHistoryRepository residentHistoryRepository() { return mock(ResidentHistoryRepository.class); }
        @Bean MaskService maskService() { return mock(MaskService.class); }
    }
}
