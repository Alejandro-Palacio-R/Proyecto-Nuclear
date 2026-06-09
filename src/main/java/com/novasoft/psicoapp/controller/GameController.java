package com.novasoft.psicoapp.controller;

import com.novasoft.psicoapp.model.*;
import com.novasoft.psicoapp.repo.*;
import com.novasoft.psicoapp.service.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.time.*;
import java.util.*;

@RestController
@RequestMapping("/api/game")
public class GameController {
  private final GameSessionRepo sessions;
  private final CaseRepo cases;
  private final SubmissionRepo submissions;
  private final AssignmentRepo assignments;
  private final CurrentUser current;

  public GameController(GameSessionRepo s, CaseRepo c, SubmissionRepo sub, AssignmentRepo a, CurrentUser cu) {
    sessions = s; cases = c; submissions = sub; assignments = a; current = cu;
  }

  @PostMapping("/sessions")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public Map<String, Object> create(@RequestBody Map<String, Object> b) {
    GameSession gs = new GameSession();
    gs.pin = uniquePin();
    gs.status = "ESPERA";
    gs.durationMinutes = intValue(b.get("durationMinutes"), 30);
    if (gs.durationMinutes < 1) throw new IllegalArgumentException("La duracion debe ser de al menos 1 minuto");
    gs.caseStudy = cases.findById(longValue(b.get("caseId"))).orElseThrow();
    gs.professor = current.get();
    return sessionDto(sessions.save(gs), null);
  }

  @PostMapping("/join/{pin}")
  @PreAuthorize("hasRole('ESTUDIANTE')")
  public Map<String, Object> join(@PathVariable String pin) {
    GameSession gs = refreshStatus(sessions.findByPin(pin).orElseThrow());
    if ("FINALIZADA".equals(gs.status)) throw new IllegalStateException("La sesion ya finalizo");

    User student = current.get();
    gs.participants.add(student);
    gs = sessions.save(gs);

    GameSession savedSession = gs;
    Assignment a = assignments.findByStudentIdAndGameSessionId(student.id, savedSession.id).stream().findFirst().orElseGet(() -> {
      Assignment x = new Assignment();
      x.caseStudy = savedSession.caseStudy;
      x.student = student;
      x.gameSession = savedSession;
      return assignments.save(x);
    });
    return sessionDto(savedSession, a.id);
  }

  @GetMapping("/sessions/{id}")
  public Map<String, Object> session(@PathVariable Long id) {
    GameSession gs = refreshStatus(sessions.findById(id).orElseThrow());
    return sessionDto(gs, assignmentIdForCurrentUser(gs));
  }

  @PostMapping("/sessions/{id}/start")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public Map<String, Object> start(@PathVariable Long id) {
    GameSession gs = sessions.findById(id).orElseThrow();
    requireHost(gs);
    if ("FINALIZADA".equals(gs.status)) throw new IllegalStateException("La sesion ya finalizo");
    if (!"EN_CURSO".equals(gs.status)) {
      gs.status = "EN_CURSO";
      gs.startedAt = LocalDateTime.now();
      gs.endsAt = gs.startedAt.plusMinutes(gs.durationMinutes == null ? 30 : gs.durationMinutes);
      gs = sessions.save(gs);
    }
    return sessionDto(gs, null);
  }

  @PutMapping("/sessions/{id}/status")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public Map<String, Object> status(@PathVariable Long id, @RequestBody Map<String, String> b) {
    GameSession gs = sessions.findById(id).orElseThrow();
    requireHost(gs);
    String status = b.get("status");
    if (!List.of("ESPERA", "EN_CURSO", "FINALIZADA").contains(status)) throw new IllegalArgumentException("Estado invalido");
    gs.status = status;
    if ("EN_CURSO".equals(status) && gs.startedAt == null) {
      gs.startedAt = LocalDateTime.now();
      gs.endsAt = gs.startedAt.plusMinutes(gs.durationMinutes == null ? 30 : gs.durationMinutes);
    }
    if ("FINALIZADA".equals(status) && gs.endsAt == null) gs.endsAt = LocalDateTime.now();
    return sessionDto(sessions.save(gs), null);
  }

  @PostMapping("/sessions/{id}/progress")
  @PreAuthorize("hasRole('ESTUDIANTE')")
  public Map<String, Object> progress(@PathVariable Long id, @RequestBody Map<String, Object> body) {
    GameSession gs = refreshStatus(sessions.findById(id).orElseThrow());
    if (!"EN_CURSO".equals(gs.status)) throw new IllegalStateException("La sesion no esta en curso");
    Assignment a = assignments.findByStudentIdAndGameSessionId(current.get().id, id).stream().findFirst().orElseThrow();
    a.currentBlockIndex = Math.max(a.currentBlockIndex, intValue(body.get("blockIndex"), a.currentBlockIndex));
    a.completed = Boolean.parseBoolean(String.valueOf(body.getOrDefault("completed", a.completed)));
    assignments.save(a);
    return sessionDto(gs, a.id);
  }

  @GetMapping("/ranking")
  public List<Map<String, Object>> ranking(@RequestParam(required = false) Long caseId) {
    User viewer = current.get();
    return submissions.findAll().stream()
      .filter(s -> s.status != null && s.assignment != null && s.assignment.caseStudy != null)
      .filter(s -> caseId == null || Objects.equals(s.assignment.caseStudy.id, caseId))
      .filter(s -> viewer.role != Role.ESTUDIANTE || Objects.equals(s.student.id, viewer.id))
      .sorted((a, b) -> Integer.compare(b.autoScore, a.autoScore))
      .map(s -> {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("estudiante", s.student.name);
        m.put("caseId", s.assignment.caseStudy.id);
        m.put("caso", s.assignment.caseStudy.title);
        m.put("puntaje", s.autoScore);
        m.put("nota", s.grade);
        return m;
      }).toList();
  }

  private Map<String, Object> sessionDto(GameSession gs, Long assignmentId) {
    gs = refreshStatus(gs);
    Map<Long, Assignment> progressByStudent = new HashMap<>();
    for (Assignment a : assignments.findByGameSessionId(gs.id)) progressByStudent.put(a.student.id, a);
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", gs.id);
    m.put("pin", gs.pin);
    m.put("status", gs.status);
    m.put("durationMinutes", gs.durationMinutes);
    m.put("startedAt", gs.startedAt);
    m.put("endsAt", gs.endsAt);
    m.put("remainingSeconds", remainingSeconds(gs));
    m.put("caseId", gs.caseStudy.id);
    m.put("caseTitle", gs.caseStudy.title);
    m.put("assignmentId", assignmentId);
    m.put("participants", gs.participants.stream().sorted(Comparator.comparing(u -> u.name == null ? "" : u.name)).map(u -> {
      Map<String, Object> p = new LinkedHashMap<>();
      p.put("id", u.id);
      p.put("name", u.name);
      p.put("email", u.email);
      Assignment a = progressByStudent.get(u.id);
      p.put("currentBlockIndex", a == null ? 0 : a.currentBlockIndex);
      p.put("completed", a != null && a.completed);
      return p;
    }).toList());
    return m;
  }

  private GameSession refreshStatus(GameSession gs) {
    if ("EN_CURSO".equals(gs.status) && gs.endsAt != null && !LocalDateTime.now().isBefore(gs.endsAt)) {
      gs.status = "FINALIZADA";
      return sessions.save(gs);
    }
    return gs;
  }

  private Long assignmentIdForCurrentUser(GameSession gs) {
    User u = current.get();
    if (u.role != Role.ESTUDIANTE && u.role != Role.ADMIN) return null;
    return assignments.findByStudentIdAndGameSessionId(u.id, gs.id).stream().findFirst().map(a -> a.id).orElse(null);
  }

  private long remainingSeconds(GameSession gs) {
    if (!"EN_CURSO".equals(gs.status) || gs.endsAt == null) return 0;
    return Math.max(0, Duration.between(LocalDateTime.now(), gs.endsAt).getSeconds());
  }

  private void requireHost(GameSession gs) {
    User u = current.get();
    if (u.role != Role.ADMIN && !Objects.equals(gs.professor.id, u.id)) throw new SecurityException("No autorizado");
  }

  private String uniquePin() {
    Random r = new Random();
    String pin;
    do { pin = String.valueOf(r.nextInt(900000) + 100000); } while (sessions.findByPin(pin).isPresent());
    return pin;
  }

  private Long longValue(Object value) {
    if (value instanceof Number n) return n.longValue();
    return Long.parseLong(value.toString());
  }

  private int intValue(Object value, int fallback) {
    if (value == null || value.toString().isBlank()) return fallback;
    if (value instanceof Number n) return n.intValue();
    return Integer.parseInt(value.toString());
  }
}
