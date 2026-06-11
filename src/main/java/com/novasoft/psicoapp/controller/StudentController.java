package com.novasoft.psicoapp.controller;

import com.novasoft.psicoapp.model.*;
import com.novasoft.psicoapp.repo.*;
import com.novasoft.psicoapp.service.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.time.*;
import java.util.*;
import java.util.stream.*;

@RestController
@RequestMapping("/api/student")
@PreAuthorize("hasRole('ESTUDIANTE')")
public class StudentController {
  private final AssignmentRepo assignments;
  private final CaseRepo cases;
  private final SubmissionRepo submissions;
  private final StudentAnswerRepo answers;
  private final QuestionRepo questions;
  private final OptionRepo options;
  private final CurrentUser current;

  public StudentController(AssignmentRepo a, CaseRepo cr, SubmissionRepo s, StudentAnswerRepo ar, QuestionRepo q, OptionRepo o, CurrentUser c) {
    assignments = a; cases = cr; submissions = s; answers = ar; questions = q; options = o; current = c;
  }

  @GetMapping("/assignments")
  public List<Map<String, Object>> myAssignments() {
    User me = current.get();
    return assignments.findByStudentId(me.id).stream().map(a -> assignmentDto(a, me)).toList();
  }

  @PostMapping("/cases/{caseId}/start")
  @PreAuthorize("hasRole('ADMIN')")
  public Assignment startCaseAsAdmin(@PathVariable Long caseId) {
    User me = current.get();
    List<Assignment> existing = assignments.findByStudentIdAndCaseStudyId(me.id, caseId);
    if (!existing.isEmpty()) return existing.get(0);
    Assignment a = new Assignment();
    a.caseStudy = cases.findById(caseId).orElseThrow();
    a.student = me;
    a.maxAttempts = 999;
    a.extraAttempts = 0;
    return assignments.save(a);
  }

  @PostMapping("/assignments/{id}/draft")
  public Submission draft(@PathVariable Long id, @RequestBody Map<String, String> body) {
    User me = current.get();
    assertLiveAssignmentOpen(id);
    Submission sub = submissionFor(id, me);
    sub.analysisText = body.get("analysisText");
    sub.status = "BORRADOR";
    sub.updatedAt = LocalDateTime.now();
    return submissions.save(sub);
  }

  @PostMapping("/assignments/{id}/answer")
  public StudentAnswer answer(@PathVariable Long id, @RequestBody Map<String, Long> body) {
    Map<String, Object> multiBody = new LinkedHashMap<>();
    multiBody.put("questionId", body.get("questionId"));
    multiBody.put("optionIds", List.of(body.get("optionId")));
    List<StudentAnswer> saved = saveMultipleAnswers(id, multiBody);
    return saved.isEmpty() ? null : saved.get(0);
  }

  @PostMapping("/assignments/{id}/answer-multiple")
  public Map<String, Object> answerMultiple(@PathVariable Long id, @RequestBody Map<String, Object> body) {
    List<StudentAnswer> saved = saveMultipleAnswers(id, body);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("questionId", longValue(body.get("questionId")));
    out.put("selectedOptionIds", saved.stream().map(a -> a.selectedOption.id).toList());
    out.put("points", saved.stream().mapToInt(a -> a.points).sum());
    out.put("correct", saved.stream().mapToInt(a -> a.points).sum() > 0);
    return out;
  }

  private List<StudentAnswer> saveMultipleAnswers(Long id, Map<String, Object> body) {
    User me = current.get();
    assertLiveAssignmentOpen(id);
    Submission sub = submissionFor(id, me);
    Question q = questions.findById(longValue(body.get("questionId"))).orElseThrow();
    List<Long> selectedIds = longList(body.get("optionIds"));
    List<AnswerOption> allOptions = options.findByQuestionIdOrderByIdAsc(q.id);
    Set<Long> correctIds = allOptions.stream().filter(o -> o.correct).map(o -> o.id).collect(Collectors.toSet());
    Set<Long> selectedSet = new LinkedHashSet<>(selectedIds);
    boolean exact = selectedSet.equals(correctIds);

    List<StudentAnswer> previous = answers.findBySubmissionIdAndQuestionId(sub.id, q.id);
    sub.autoScore -= previous.stream().mapToInt(a -> a.points).sum();
    answers.deleteAll(previous);

    List<StudentAnswer> out = new ArrayList<>();
    boolean pointsAssigned = false;
    for (Long optionId : selectedSet) {
      AnswerOption opt = options.findById(optionId).orElseThrow();
      if (!Objects.equals(opt.question.id, q.id)) throw new IllegalArgumentException("La opcion no pertenece a la pregunta");
      StudentAnswer a = new StudentAnswer();
      a.submission = sub;
      a.question = q;
      a.selectedOption = opt;
      a.correct = opt.correct;
      a.points = exact && !pointsAssigned ? q.score : 0;
      pointsAssigned = pointsAssigned || a.points > 0;
      out.add(answers.save(a));
    }

    sub.autoScore += exact ? q.score : 0;
    sub.updatedAt = LocalDateTime.now();
    submissions.save(sub);
    return out;
  }

  @PostMapping("/assignments/{id}/submit")
  public Submission submit(@PathVariable Long id, @RequestBody Map<String, String> body) {
    User me = current.get();
    assertLiveAssignmentOpen(id);
    Submission sub = currentSubmission(id, me).orElseThrow();
    if (body.containsKey("analysisText")) sub.analysisText = body.get("analysisText");
    sub.status = "ENVIADO";
    sub.submittedAt = LocalDateTime.now();
    Assignment a = assignments.findById(id).orElseThrow();
    a.completed = true;
    assignments.save(a);
    return submissions.save(sub);
  }

  @GetMapping("/submissions")
  public List<Submission> mySubmissions() {
    return submissions.findByStudentId(current.get().id);
  }

  private Submission submissionFor(Long assignmentId, User me) {
    Assignment assignment = assignments.findById(assignmentId).orElseThrow();
    if (!Objects.equals(assignment.student.id, me.id)) throw new SecurityException("No autorizado");
    Optional<Submission> draft = currentSubmission(assignmentId, me);
    if (draft.isPresent()) return draft.get();

    long submitted = submissions.findByAssignmentIdAndStudentIdOrderByAttemptNumberDesc(assignmentId, me.id).stream()
      .filter(s -> !"BORRADOR".equals(s.status))
      .count();
    int allowed = Math.max(1, assignment.maxAttempts) + Math.max(0, assignment.extraAttempts);
    if (submitted >= allowed) throw new IllegalStateException("Ya agotaste los intentos disponibles");

    int nextAttempt = submissions.findByAssignmentIdAndStudentIdOrderByAttemptNumberDesc(assignmentId, me.id).stream()
      .mapToInt(s -> s.attemptNumber)
      .max()
      .orElse(0) + 1;
    Submission x = new Submission();
    x.assignment = assignment;
    x.student = me;
    x.attemptNumber = nextAttempt;
    return submissions.save(x);
  }

  private Optional<Submission> currentSubmission(Long assignmentId, User me) {
    return submissions.findByAssignmentIdAndStudentIdOrderByAttemptNumberDesc(assignmentId, me.id).stream()
      .filter(s -> "BORRADOR".equals(s.status))
      .findFirst();
  }

  private Map<String, Object> assignmentDto(Assignment a, User me) {
    List<Submission> subs = submissions.findByAssignmentIdAndStudentIdOrderByAttemptNumberDesc(a.id, me.id);
    long submitted = subs.stream().filter(s -> !"BORRADOR".equals(s.status)).count();
    int allowed = Math.max(1, a.maxAttempts) + Math.max(0, a.extraAttempts);
    Submission latest = subs.stream().findFirst().orElse(null);
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", a.id);
    m.put("caseStudy", a.caseStudy);
    m.put("maxAttempts", Math.max(1, a.maxAttempts));
    m.put("extraAttempts", Math.max(0, a.extraAttempts));
    m.put("attemptsUsed", submitted);
    m.put("attemptsAllowed", allowed);
    m.put("canStart", submitted < allowed || (latest != null && "BORRADOR".equals(latest.status)));
    m.put("latestScore", latest == null ? null : latest.autoScore);
    m.put("latestStatus", latest == null ? null : latest.status);
    m.put("latestAttempt", latest == null ? null : latest.attemptNumber);
    return m;
  }

  private void assertLiveAssignmentOpen(Long assignmentId) {
    Assignment a = assignments.findById(assignmentId).orElseThrow();
    if (a.gameSession == null) return;
    GameSession gs = a.gameSession;
    LocalDateTime now = LocalDateTime.now();
    if (!"EN_CURSO".equals(gs.status)) throw new IllegalStateException("La sesion no esta en curso");
    if (gs.endsAt != null && !now.isBefore(gs.endsAt)) throw new IllegalStateException("El tiempo de la sesion termino");
  }

  private Long longValue(Object value) {
    if (value instanceof Number n) return n.longValue();
    return Long.parseLong(value.toString());
  }

  private List<Long> longList(Object value) {
    if (!(value instanceof List<?> list)) return List.of();
    return list.stream().map(v -> v instanceof Number n ? n.longValue() : Long.parseLong(v.toString())).toList();
  }
}
