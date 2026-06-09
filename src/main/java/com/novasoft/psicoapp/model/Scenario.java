package com.novasoft.psicoapp.model; import jakarta.persistence.*;
@Entity public class Scenario{ @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id; public String title; @Column(length=2500) public String contextText; public String blockType="TEXT"; public int orderIndex=1; @ManyToOne public CaseStudy caseStudy; }
